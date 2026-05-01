import { Router } from "express";
import { db } from "../db.js";
import { verifyAuthHeader } from "../services/auth.js";

export const bountiesRouter = Router();

bountiesRouter.get("/", async (req, res, next) => {
  try {
    const auth = await verifyAuthHeader(req.header("authorization"));
    const user = await db.user.findUnique({
      where: { externalAuthId: auth.externalAuthId },
      include: { bounties: true }
    });

    res.json({ bounties: user?.bounties ?? [] });
  } catch (error) {
    next(error);
  }
});
