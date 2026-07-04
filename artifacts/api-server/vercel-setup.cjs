const fs = require("fs");
fs.mkdirSync(".vercel/output/static", { recursive: true });
fs.writeFileSync(
  ".vercel/output/config.json",
  JSON.stringify({
    version: 3,
    routes: [
      {
        src: "/api/(.*)",
        dest: "https://checkr-65338da1ae87.herokuapp.com/api/$1",
      },
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/index.html" },
    ],
  })
);
console.log("Vercel output config created with Heroku API proxy");
