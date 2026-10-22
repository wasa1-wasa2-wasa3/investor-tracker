import data from "../data/x-posts.json";

export const X_POSTS = data.posts || [];
export const X_UPDATED_AT = data.updatedAt;

export const STANCE = { buy: "買い", sell: "売り", hold: "保有", mention: "言及" };

// 銘柄コード → その銘柄に触れた投稿（新しい順）
export const X_BY_CODE = X_POSTS.reduce((m, p) => {
  if (p.secCode) (m[p.secCode] ||= []).push(p);
  return m;
}, {});
