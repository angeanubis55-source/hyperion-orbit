using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace DarkOrbitLauncher;

internal static class Program
{
    private static readonly Dictionary<string, string> MimeTypes = new()
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".png"] = "image/png",
        [".gif"] = "image/gif",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".webp"] = "image/webp",
        [".svg"] = "image/svg+xml",
        [".ico"] = "image/x-icon",
        [".mp3"] = "audio/mpeg",
        [".wav"] = "audio/wav",
        [".ogg"] = "audio/ogg",
        [".woff"] = "font/woff",
        [".woff2"] = "font/woff2",
    };

    [STAThread]
    private static void Main()
    {
        var root = FindGameRoot(AppContext.BaseDirectory)
            ?? FindGameRoot(Environment.CurrentDirectory)
            ?? throw new InvalidOperationException("Le dossier du jeu est introuvable. Placez le lanceur dans le dossier du jeu.");

        try
        {
            var envPort = Environment.GetEnvironmentVariable("DO_PORT");
            var port = int.TryParse(envPort, out var p) && p > 0 ? p : 0;
            var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var address = $"http://127.0.0.1:{port}/";

            _ = Task.Run(() => Serve(listener, root));

            _ = Process.Start(new ProcessStartInfo
            {
                FileName = address,
                UseShellExecute = true,
            }) ?? throw new InvalidOperationException("Le navigateur n'a pas pu être ouvert.");

            new ManualResetEventSlim().Wait();
        }
        catch (Exception error)
        {
            ShowError(error.Message);
        }
    }

    private static async Task Serve(TcpListener listener, string root)
    {
        while (true)
        {
            TcpClient client;
            try { client = await listener.AcceptTcpClientAsync(); }
            catch { break; }

            _ = Task.Run(() => HandleClient(client, root));
        }
    }

    private static async Task HandleClient(TcpClient client, string root)
    {
        using (client)
        using (var stream = client.GetStream())
        {
            try
            {
                var requestLine = await ReadLineAsync(stream);
                if (string.IsNullOrWhiteSpace(requestLine)) return;

                var parts = requestLine.Split(' ');
                var path = parts.Length > 1 ? parts[1] : "/";
                await DrainHeaders(stream);

                var relative = path == "/" ? "index.html" : path.TrimStart('/').Split('?')[0];
                var file = Path.GetFullPath(Path.Combine(root, Uri.UnescapeDataString(relative)));
                var rootPath = Path.GetFullPath(root);

                if (!file.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase) || !File.Exists(file))
                {
                    await WriteResponse(stream, 404, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Fichier introuvable"));
                    return;
                }

                var bytes = await File.ReadAllBytesAsync(file);
                await WriteResponse(stream, 200, MimeTypes.GetValueOrDefault(Path.GetExtension(file).ToLowerInvariant()) ?? "application/octet-stream", bytes, noCache: true);
            }
            catch { /* connection reset or parse error */ }
        }
    }

    private static async Task WriteResponse(NetworkStream stream, int status, string contentType, byte[] body, bool noCache = false)
    {
        var header = new StringBuilder();
        header.Append($"HTTP/1.1 {status} {(status == 200 ? "OK" : "Not Found")}\r\n");
        header.Append($"Content-Type: {contentType}\r\n");
        header.Append($"Content-Length: {body.Length}\r\n");
        if (noCache) header.Append("Cache-Control: no-cache\r\n");
        header.Append("Connection: close\r\n\r\n");

        var headerBytes = Encoding.UTF8.GetBytes(header.ToString());
        await stream.WriteAsync(headerBytes);
        await stream.WriteAsync(body);
        await stream.FlushAsync();
    }

    private static async Task<string?> ReadLineAsync(NetworkStream stream)
    {
        var builder = new StringBuilder();
        var buffer = new byte[1];
        while (await stream.ReadAsync(buffer, 0, 1) == 1)
        {
            var c = (char)buffer[0];
            if (c == '\n') break;
            if (c != '\r') builder.Append(c);
        }
        return builder.Length > 0 ? builder.ToString() : null;
    }

    private static async Task DrainHeaders(NetworkStream stream)
    {
        var line = await ReadLineAsync(stream);
        while (!string.IsNullOrEmpty(line))
        {
            line = await ReadLineAsync(stream);
        }
    }

    private static string? FindGameRoot(string start)
    {
        var directory = new DirectoryInfo(start);
        for (var depth = 0; directory is not null && depth < 6; depth++, directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "index.html")))
            {
                var scripts = Path.Combine(directory.FullName, "scripts", "game-server.js");
                if (File.Exists(scripts) || Directory.Exists(Path.Combine(directory.FullName, "src"))) return directory.FullName;
            }
        }
        return null;
    }

    private static void ShowError(string message)
    {
        var script = $"Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('{message.Replace("'", "''")}', 'DarkOrbit Launcher', 'OK', 'Error')";
        var p = Process.Start(new ProcessStartInfo("powershell.exe", $"-NoProfile -WindowStyle Hidden -Command \"{script}\"") { UseShellExecute = false });
        p?.WaitForExit();
    }
}
