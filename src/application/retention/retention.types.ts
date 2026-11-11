export interface RetentionPolicy {
  photoDays: number;
  personalDataDays: number;
  autoEnabled: boolean;
}

export interface PurgeCounts {
  photosDeleted: number;
  visitorsAnonymized: number;
  vehiclesAnonymized: number;
  visitsCleaned: number;
}

export interface PurgeLogView extends PurgeCounts {
  id: string;
  ranAtText: string;
  trigger: "AUTO" | "MANUAL";
  actor: string | null;
  photoDays: number;
  personalDataDays: number;
  error: string | null;
}

export interface PhotoRef {
  /** "visit" = รูปใบหน้า, "vehicle" = รูปป้ายทะเบียน */
  kind: "visit" | "vehicle" | "idcard";
  id: string;
  url: string;
}

export interface RetentionRepository {
  getPolicy(): Promise<RetentionPolicy>;
  savePolicy(policy: RetentionPolicy, by: string): Promise<void>;

  /** รูปของการเข้าพื้นที่ที่จบแล้วและเก่ากว่า cutoff */
  findExpiredPhotos(cutoff: Date, limit: number): Promise<PhotoRef[]>;
  clearPhotoRefs(refs: PhotoRef[]): Promise<void>;
  countExpiredPhotos(cutoff: Date): Promise<number>;

  /** ทำให้ข้อมูลส่วนบุคคลไม่ระบุตัวตน (ข้าม blacklist และคนที่ยังอยู่ในพื้นที่) — คืนจำนวนที่ทำ */
  anonymizePersonalData(cutoff: Date, at: Date): Promise<Omit<PurgeCounts, "photosDeleted">>;
  countPersonalDataDue(cutoff: Date): Promise<Omit<PurgeCounts, "photosDeleted">>;

  logRun(entry: PurgeCounts & { trigger: "AUTO" | "MANUAL"; actor?: string; policy: RetentionPolicy; error?: string }): Promise<void>;
  listRuns(limit: number): Promise<(Omit<PurgeLogView, "ranAtText"> & { ranAt: Date })[]>;
}

export interface PhotoDeleter {
  /** ลบไฟล์รูปตาม URL — ไม่ error ถ้าไฟล์ไม่มีอยู่แล้ว */
  deleteByUrl(url: string): Promise<void>;
}
