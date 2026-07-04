import express, { type Express } from "express";
import cors from "cors";
import _pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

// pino-http pode exportar como default ou como .default dependendo do bundler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pinoHttp: (...args: any[]) => any =
  typeof (_pinoHttp as any).default === "function"
    ? (_pinoHttp as any).default
    : (_pinoHttp as any);

const app: Express = express();
app.set("trust proxy", 1); // IPs reais atrás de proxy (Heroku, Nginx, etc)

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
