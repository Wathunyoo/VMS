import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { TokenService } from "@/application/ports";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export const randomTokens: TokenService = {
  create() {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: hash(token) };
  },
  hash,
};
