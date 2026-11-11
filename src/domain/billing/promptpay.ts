/**
 * สร้างข้อมูล QR PromptPay (มาตรฐาน EMVCo / Thai QR Payment) พร้อมยอดเงิน
 * รับเบอร์มือถือ (10 หลัก) หรือเลขประจำตัวผู้เสียภาษี / บัตรประชาชน (13 หลัก)
 */
const tlv = (id: string, value: string) => `${id}${value.length.toString().padStart(2, "0")}${value}`;

export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function promptPayPayload(target: string, amount?: number): string {
  const id = target.replace(/\D/g, "");
  let account: string;
  if (id.length === 10 && id.startsWith("0")) account = tlv("01", ("0066" + id.slice(1)).padStart(13, "0"));
  else if (id.length === 13) account = tlv("02", id);
  else throw new Error("PromptPay ID ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13 หลัก");

  const merchant = tlv("29", tlv("00", "A000000677010111") + account);
  const parts = [
    tlv("00", "01"),
    tlv("01", amount ? "12" : "11"), // 12 = ใช้ครั้งเดียว (มียอด), 11 = ใช้ซ้ำได้
    merchant,
    tlv("58", "TH"),
    tlv("53", "764"),
    ...(amount ? [tlv("54", amount.toFixed(2))] : []),
  ].join("");
  const withCrcTag = parts + "6304";
  return withCrcTag + crc16(withCrcTag);
}
