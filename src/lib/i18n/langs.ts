/** Extra (non-Hindi) interface languages. Each file maps English keys to that language. */
import type { MsgKey } from "./messages";
import type { LoginStrings } from "./login";
import { bn, login_bn } from "./langs/bn";
import { bn2 } from "./langs/bn-2";
import { mr, login_mr } from "./langs/mr";
import { mr2 } from "./langs/mr-2";
import { te, login_te } from "./langs/te";
import { te2 } from "./langs/te-2";
import { ta, login_ta } from "./langs/ta";
import { ta2 } from "./langs/ta-2";
import { gu, login_gu } from "./langs/gu";
import { gu2 } from "./langs/gu-2";
import { kn, login_kn } from "./langs/kn";
import { kn2 } from "./langs/kn-2";
import { ml, login_ml } from "./langs/ml";
import { ml2 } from "./langs/ml-2";
import { pa, login_pa } from "./langs/pa";
import { pa2 } from "./langs/pa-2";

export const EXTRA_LANG_MESSAGES: Partial<Record<string, Partial<Record<MsgKey, string>>>> = {
  bn: { ...bn, ...bn2 },
  mr: { ...mr, ...mr2 },
  te: { ...te, ...te2 },
  ta: { ...ta, ...ta2 },
  gu: { ...gu, ...gu2 },
  kn: { ...kn, ...kn2 },
  ml: { ...ml, ...ml2 },
  pa: { ...pa, ...pa2 },
};

export const EXTRA_LOGIN_STRINGS: Partial<Record<string, LoginStrings>> = {
  ...(login_bn ? { bn: login_bn } : {}),
  ...(login_mr ? { mr: login_mr } : {}),
  ...(login_te ? { te: login_te } : {}),
  ...(login_ta ? { ta: login_ta } : {}),
  ...(login_gu ? { gu: login_gu } : {}),
  ...(login_kn ? { kn: login_kn } : {}),
  ...(login_ml ? { ml: login_ml } : {}),
  ...(login_pa ? { pa: login_pa } : {}),
};
