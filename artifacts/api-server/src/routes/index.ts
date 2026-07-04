import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pixRouter from "./pix";
import cpfRouter from "./cpf";
import blockRouter from "./block";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pixRouter);
router.use(cpfRouter);
router.use("/block", blockRouter);

export default router;
