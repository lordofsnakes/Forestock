import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import market from "./api/market.js";
http
  .createServer(async (req, res) => {
    const route = new URL(req.url, "http://localhost").pathname;
    if (route === "/api/market") {
      res.status = (n) => {
        res.statusCode = n;
        return res;
      };
      res.json = (d) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(d));
      };
      return market(req, res);
    }
    try {
      const file = path.resolve(
        "public",
        "." + (route === "/" ? "/index.html" : route),
      );
      if (!file.startsWith(path.resolve("public") + path.sep)) throw Error();
      const data = await fs.readFile(file);
      res.setHeader(
        "content-type",
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".json": "application/json",
          ".css": "text/css",
          ".png": "image/png",
          ".jpg": "image/jpeg",
        }[path.extname(file)] || "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(Number(process.env.PORT) || 3000);
