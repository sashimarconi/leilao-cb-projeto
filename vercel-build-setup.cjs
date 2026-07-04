const fs = require("fs");
fs.mkdirSync(".vercel/output/static", { recursive: true });
fs.writeFileSync(
  ".vercel/output/config.json",
  JSON.stringify({
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/index.html" },
    ],
  })
);
console.log("Vercel output config created at .vercel/output/config.json");
