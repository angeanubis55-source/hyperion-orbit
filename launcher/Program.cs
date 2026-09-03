using System.Diagnostics;
using System.Text;

namespace DarkOrbitLauncher;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Process? server = null;
        try
        {
            var root = FindGameRoot(AppContext.BaseDirectory)
                ?? FindGameRoot(Environment.CurrentDirectory)
                ?? throw new InvalidOperationException("Le dossier du jeu est introuvable. Placez le lanceur dans le dossier Darkorbit LOL.");

            var node = FindExecutable("node.exe")
                ?? throw new InvalidOperationException("Node.js est requis pour démarrer le serveur local du jeu.");

            server = StartServer(node, root);
            var address = server.StandardOutput.ReadLine();
            if (string.IsNullOrWhiteSpace(address) || !address.StartsWith("http://127.0.0.1:", StringComparison.Ordinal))
                throw new InvalidOperationException("Le serveur local n'a pas pu démarrer.");

            _ = Process.Start(new ProcessStartInfo
            {
                FileName = address,
                UseShellExecute = true,
            }) ?? throw new InvalidOperationException("Le navigateur n'a pas pu être ouvert.");
        }
        catch (Exception error)
        {
            ShowError(error.Message);
        }
        finally
        {
            if (server is { HasExited: false })
            {
                try { server.Kill(entireProcessTree: true); } catch { }
            }
        }
    }

    private static Process StartServer(string node, string root)
    {
        var info = new ProcessStartInfo
        {
            FileName = node,
            Arguments = "scripts/game-server.js --port=0",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        return Process.Start(info) ?? throw new InvalidOperationException("Impossible de lancer le serveur local.");
    }

    private static string? FindGameRoot(string start)
    {
        var directory = new DirectoryInfo(start);
        for (var depth = 0; directory is not null && depth < 6; depth++, directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "index.html")) &&
                File.Exists(Path.Combine(directory.FullName, "scripts", "game-server.js"))) return directory.FullName;
        }
        return null;
    }

    private static string? FindExecutable(string name)
    {
        foreach (var folder in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            var candidate = Path.Combine(folder.Trim(), name);
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static void ShowError(string message)
    {
        var script = $"Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('{message.Replace("'", "''")}', 'DarkOrbit Launcher', 'OK', 'Error')";
        Process.Start(new ProcessStartInfo("powershell.exe", $"-NoProfile -WindowStyle Hidden -Command \"{script}\"") { UseShellExecute = false })?.WaitForExit();
    }
}
