import "server-only";
import type { SlipProvider, SlipProviderResult } from "@/application/billing/billing.types";

/**
 * EasySlip (https://document.easyslip.com) — ตรวจรายการโอนกับธนาคารจากข้อความใน QR บนสลิป
 * ส่งเฉพาะ payload ของ QR (เลขอ้างอิงรายการ) ไม่ได้ส่งรูปสลิปออกไป
 */
const ENDPOINT = "https://api.easyslip.com/v2/verify/bank";

interface EasySlipAccount {
  name?: { th?: string; en?: string };
  bank?: { type?: string; account?: string };
  proxy?: { type?: string; account?: string };
}
interface EasySlipResponse {
  success?: boolean;
  message?: string;
  error?: { code?: string; message?: string };
  data?: {
    matchedAccount?: unknown;
    rawSlip?: {
      transRef?: string;
      date?: string;
      amount?: { amount?: number };
      sender?: { bank?: { short?: string; name?: string }; account?: EasySlipAccount };
      receiver?: { bank?: { short?: string; name?: string }; account?: EasySlipAccount };
    };
  };
}

export function easySlipProvider(apiKey: string, fetchImpl: typeof fetch = fetch): SlipProvider {
  return {
    name: "EasySlip",
    async verify(payload): Promise<SlipProviderResult> {
      let res: Response;
      try {
        res = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ payload, matchAccount: true }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        return { kind: "ERROR", message: `เชื่อมต่อไม่ได้: ${(e as Error).message}` };
      }
      const body = (await res.json().catch(() => ({}))) as EasySlipResponse;
      const code = body.error?.code;
      if (code === "SLIP_PENDING") return { kind: "PENDING" };
      if (code === "SLIP_NOT_FOUND") return { kind: "NOT_FOUND" };
      const slip = body.data?.rawSlip;
      if (!res.ok || !body.success || !slip) {
        return { kind: "ERROR", message: `${res.status} ${code ?? ""} ${body.error?.message ?? body.message ?? ""}`.trim() };
      }
      const amount = Number(slip.amount?.amount);
      const date = new Date(slip.date ?? "");
      if (!Number.isFinite(amount) || Number.isNaN(date.getTime())) return { kind: "ERROR", message: "ข้อมูลสลิปจากผู้ให้บริการไม่ครบ" };
      const recv = slip.receiver?.account;
      const send = slip.sender?.account;
      return {
        kind: "VERIFIED",
        transRef: slip.transRef ?? "",
        amount,
        date,
        senderName: send?.name?.th || send?.name?.en || null,
        senderBank: slip.sender?.bank?.short ?? slip.sender?.bank?.name ?? null,
        receiverName: recv?.name?.th || recv?.name?.en || null,
        receiverAccount: recv?.bank?.account ?? null,
        receiverProxy: recv?.proxy?.account ?? null,
        receiverBank: slip.receiver?.bank?.short ?? slip.receiver?.bank?.name ?? null,
        providerAccountMatched: !!body.data?.matchedAccount,
      };
    },
  };
}
