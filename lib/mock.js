// EDINET APIキーが無いときに使う、書類一覧APIの形を真似たダミーデータ。
// 銘柄・内容は架空。画面と照合ロジックの確認用。
export const MOCK_DOCS = [
  { docID: "S100MOCK1", submitDateTime: "2026-10-16 15:02", docTypeCode: "350", filerName: "片山　晃", docDescription: "大量保有報告書", subjectEdinetCode: "E99001", withdrawalStatus: "0" },
  { docID: "S100MOCK2", submitDateTime: "2026-10-16 13:40", docTypeCode: "350", filerName: "株式会社シティインデックスイレブンス", docDescription: "変更報告書", subjectEdinetCode: "E99002", withdrawalStatus: "0" },
  { docID: "S100MOCK3", submitDateTime: "2026-10-15 16:10", docTypeCode: "350", filerName: "光通信株式会社", docDescription: "変更報告書（短期大量譲渡）", subjectEdinetCode: "E99003", withdrawalStatus: "0" },
  { docID: "S100MOCK4", submitDateTime: "2026-10-15 11:05", docTypeCode: "350", filerName: "ＵＨ　Ｐａｒｔｎｅｒｓ　２株式会社", docDescription: "大量保有報告書", subjectEdinetCode: "E99004", withdrawalStatus: "0" },
  { docID: "S100MOCK5", submitDateTime: "2026-10-14 17:20", docTypeCode: "360", filerName: "Effissimo Capital Management Pte Ltd", docDescription: "訂正報告書（大量保有報告書・変更報告書）", subjectEdinetCode: "E99005", withdrawalStatus: "0" },
  { docID: "S100MOCK6", submitDateTime: "2026-10-14 10:00", docTypeCode: "360", filerName: "野村證券株式会社", docDescription: "変更報告書", subjectEdinetCode: "E99001", withdrawalStatus: "0" },
  { docID: "S100MOCK8", submitDateTime: "2026-10-13 15:00", docTypeCode: "240", filerName: "株式会社（架空）ビッド", docDescription: "公開買付届出書", subjectEdinetCode: "E99002", withdrawalStatus: "0" },
  { docID: "S100MOCK7", submitDateTime: "2026-10-14 09:30", docTypeCode: "120", filerName: "株式会社テスト", docDescription: "有価証券報告書", subjectEdinetCode: null, withdrawalStatus: "0" },
];
