export const WORLD = {
  w: 11000,
  h: 7000,

  bgLayers: [
    {
      src: "./Backgrounds/map1-7.png",
      mode: "cover",
      alpha: 1,
      parallax: 0,
    },
    {
      src: "./Backgrounds/mmo_stars.png",
      mode: "tile",
      alpha: 0.55,
      parallax: 0.2,
      blend: "lighter",
    },
    {
      src: "./Backgrounds/mmo_texture.png",
      mode: "tile",
      alpha: 0.55,
      parallax: 0.25,
    },
    {
      src: "./Backgrounds/const_stars.png",
      mode: "tile",
      alpha: 1,
      parallax: 0.25,
    },
    {
      src: "./Backgrounds/const_texture_2.png",
      mode: "tile",
      alpha: 1,
      parallax: 0.35,
    },
  ]
};
