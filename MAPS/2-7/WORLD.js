export const WORLD = {
  w: 11000,
  h: 7000,

  bgLayers: [
    {
      src: "./BACKGROUNDS/MAP2_7.png",
      mode: "cover",
      alpha: 1,
      parallax: 0,
    },
    {
      src: "./BACKGROUNDS/EIC_STARS.png",
      mode: "tile",
      alpha: 0.55,
      parallax: 0.2,
      blend: "lighter",
    },
    {
      src: "./BACKGROUNDS/EIC_TEXTURE.png",
      mode: "tile",
      alpha: 0.55,
      parallax: 0.25,
    },
    {
      src: "./BACKGROUNDS/CONST_STARS.png",
      mode: "tile",
      alpha: 1,
      parallax: 0.25,
    },
    {
      src: "./BACKGROUNDS/CONST_TEXTURE_2.png",
      mode: "tile",
      alpha: 1,
      parallax: 0.35,
    },
  ]
};
