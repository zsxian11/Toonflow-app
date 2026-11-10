import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.post("/", validateFields({
  directory: z.string().min(1).max(4096),
  episode: z.string().trim().min(1).max(120).optional(),
  clips: z.array(z.strictObject({
    path: z.string().min(1).max(4096),
    dialogue: z.string().max(20000).optional(),
  })).min(1).max(200),
}), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const cwd = await u.workspace.resolveWorkspace(req, req.body.directory);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once("close", close);
  req.once("aborted", close);
  req.socket.once("close", close);
  try {
    const result = await u.production.exportEpisode(cwd, req.body.clips, req.body.episode, controller.signal);
    if (!res.destroyed) res.set("Cache-Control", "no-store").json(success(result));
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    res.off("close", close);
    req.off("aborted", close);
    req.socket.off("close", close);
  }
});
