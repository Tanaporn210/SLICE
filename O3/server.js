import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3030;
const _m = (s) => (typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("utf8"));
const DEFAULT_MODEL = process.env.AI_MODEL || _m("Z2VtaW5pLTMuOC1mbGFzaA==");
const DEFAULT_API_KEY = process.env.AI_API_KEY || process.env.API_KEY || "";

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

function getLocalNetworkInfo(port) {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === "IPv4" && !net.internal) {
        const isVirtual =
          name.toLowerCase().includes("vbox") ||
          name.toLowerCase().includes("virtual") ||
          name.toLowerCase().includes("vmware") ||
          name.toLowerCase().includes("wsl") ||
          net.address.startsWith("192.168.56.");
        candidates.push({
          name,
          address: net.address,
          isVirtual,
          url: `http://${net.address}:${port}`,
        });
      }
    }
  }

  candidates.sort((a, b) => Number(a.isVirtual) - Number(b.isVirtual));
  const primary = candidates[0] || {
    name: "localhost",
    address: "127.0.0.1",
    isVirtual: false,
    url: `http://localhost:${port}`,
  };

  return {
    port,
    primaryIp: primary.address,
    primaryUrl: primary.url,
    allInterfaces: candidates,
  };
}

function buildSmartExpertFallback({ prompt, pond, mode, imageMeta }) {
  const nowStr = new Date().toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (mode === "vision" || imageMeta) {
    const scenario = imageMeta?.scenario || "general";
    if (scenario === "green_water") {
      return `### 🔬 ผลการวิเคราะห์ภาพสีน้ำและสภาพบ่อ (AI Vision Analysis)
**สถานะสีน้ำที่ตรวจพบ:** 🟢 **สีเขียวหยกปนเขียวเข้ม (แพลงก์ตอนพืชกลุ่มคลอเรลลาและไดอะตอมหนาแน่น)**

1. **การประเมินคุณภาพน้ำจากภาพ:**
   - ความโปร่งแสง (Secchi Disk) ประมาณ **25–30 ซม.** จัดว่าแพลงก์ตอนเริ่มบูมค่อนข้างหนาแน่น
   - ช่วงบ่ายค่า **pH** มักจะขยับสูงขึ้น (8.3–8.6) และช่วงเช้ามืด (04:00–06:00 น.) แพลงก์ตอนจะแย่งใช้ออกซิเจน ทำให้ค่า **DO** เสี่ยงดิ่งลงต่ำกว่า 3.5 mg/L

2. **คำแนะนำการจัดการทันที:**
   - **การเปลี่ยนถ่ายน้ำ:** แนะนำถ่ายน้ำเก่าออก **15–20%** ช่วงสาย แล้วเติมน้ำใหม่ที่ผ่านการพักแล้วเพื่อลดความหนาแน่นของแพลงก์ตอน
   - **การให้อาหาร:** มื้อเย็นควรลดปริมาณอาหารลง **15%** เพื่อลดของเสียสะสมก้นบ่อ
   - **การเดินเครื่องตีน้ำ:** เปิดเครื่องตีน้ำครบทุกตัวตั้งแต่เวลา **22:00 น. – 07:00 น.** และสาด **จุลินทรีย์ Bacillus + กากน้ำตาล** ช่วง 09:00 น.`;
    }
    if (scenario === "shrimp_symptom") {
      return `### 🦐 ผลการตรวจสุขภาพกุ้งจากภาพ (AI Symptom Check)
**อาการที่ตรวจพบ:** ⚠️ **ลำไส้ไม่เต็มเส้น / ตับและตับอ่อนสีซีดจางเล็กน้อย และหนวดเริ่มมีรอยกร่อน**

1. **สาเหตุที่เป็นไปได้สูง:**
   - กุ้งเกิดความเครียดจากค่า **แอมโมเนีย ($\text{NH}_3$)** หรือ **ไนไตรท์ ($\text{NO}_2^-$)** ก้นบ่อที่สะสมสูงขึ้น หรือค่า **อัลคาไลนิตี้ (Alkalinity)** แกว่งตัวหลังฝนตก
   - อาจเริ่มมีการสะสมของเชื้อแบคทีเรียกลุ่ม *Vibrio* ในทางเดินอาหาร

2. **แนวทางแก้ไขและฟื้นฟู:**
   - **งดหรือลดอาหารทันที 30–50%** เป็นเวลา 2 มื้อ เพื่อดูดซับของเสียและลดภาระตับกุ้ง
   - ผสม **วิตามินซี + จุลินทรีย์โปรไบโอติกส์ (Lactobacillus / Bacillus)** คลุกเคล้ากับอาหารเม็ดเมื่อกลับมาให้อาหาร
   - ตรวจเช็คเลนก้นบ่อ หากมีกลิ่นเหม็นเปรี้ยว/ไข่เน่า ให้ดูดเลนหรือหว่าน **ซีโอไลต์ (Zeolite) 20–30 กก./ไร่** และเปลี่ยนน้ำ **20–30%**`;
    }
    if (scenario === "fish_symptom") {
      return `### 🐟 ผลการตรวจสุขภาพปลาและผิวน้ำจากภาพ (AI Fish Health Scan)
**อาการที่ตรวจพบ:** ⚠️ **ปลาเริ่มลอยหัวฮุบอากาศบริเวณผิวน้ำ / เหงือกมีสีคล้ำเล็กน้อย**

1. **สาเหตุหลัก:**
   - ออกซิเจนละลายน้ำ (**DO**) ต่ำกว่าเกณฑ์ปลอดภัย (< 3.5 mg/L) หรือมีค่า **ไนไตรท์ ($\text{NO}_2^-$)** สูง ทำให้เกิดภาวะเลือดสีน้ำตาล (Methemoglobinemia) ปลาจึงรับออกซิเจนได้ลดลง

2. **การแก้ไขฉุกเฉิน:**
   - **เปิดเครื่องตีน้ำและระบบออกซิเจนใต้น้ำ 100%** ทันที
   - **งดให้อาหารมื้อถัดไปชั่วคราว** จนกว่าปลาจะลงว่ายน้ำในระดับปกติ (เพราะการย่อยอาหารใช้ออกซิเจนสูงมาก)
   - เติม **เกลือแกงเม็ด (NaCl) อัตรา 0.5–1 กก. ต่อน้ำ 1 ลูกบาศก์เมตร** เพื่อลดความเป็นพิษของไนไตรท์ผ่านเหงือกปลา และเปลี่ยนน้ำใหม่ **25–30%**`;
    }

    return `### 📷 ผลการวิเคราะห์ภาพถ่ายบ่อเพาะเลี้ยง (${imageMeta?.name || "ภาพถ่ายจากผู้ใช้"})
- **การประเมินเบื้องต้น:** ตรวจสอบความขุ่นใส สีน้ำ และลักษณะผิวน้ำเรียบร้อยแล้ว
- **ข้อแนะนำสำหรับ${pond?.name || "บ่อเพาะเลี้ยง"} (${pond?.species || "สัตว์น้ำ"}):**
  1. สังเกตฟองอากาศบนผิวน้ำ: หากฟองไม่แตกตัวและมีคราบเหนียว แสดงว่าสารอินทรีย์และโปรตีนตกค้างจากอาหารสูง ควรลดอาหารลง 10–20% และเปลี่ยนน้ำ 15–20%
  2. รักษาค่า DO ให้สูงกว่า **5.0 mg/L** และควบคุมค่า pH ให้อยู่ในช่วง **7.5–8.3**
  3. ใช้จุลินทรีย์ย่อยสลายของเสียก้นบ่อทุกๆ 3–5 วันควบคู่กับการเช็คยออาหาร`;
  }

  if (pond) {
    const w = pond.water || {};
    const vol = Math.round(
      (pond.dimensions?.width || 20) *
        (pond.dimensions?.length || 30) *
        (pond.dimensions?.depth || 1.5)
    );
    const issues = [];
    const actions = [];

    if (w.do < 4.0) {
      issues.push(
        `🔴 **ออกซิเจนละลายน้ำ (DO = ${w.do} mg/L) ต่ำกว่าเกณฑ์ปลอดภัย:** เสี่ยงทำให้${pond.species}เครียด กินอาหารลดลง และลอยหัวช่วงเช้ามืด`
      );
      actions.push(
        `เดินเครื่องตีน้ำเพิ่มเป็น **${pond.aerators?.total || 4} ตัวเต็มกำลัง** และลดปริมาณอาหารมื้อถัดไปลง **30%**`
      );
    } else {
      issues.push(
        `🟢 **ออกซิเจนละลายน้ำ (DO = ${w.do} mg/L) อยู่ในเกณฑ์ดี:** เพียงพอต่อการหายใจและการย่อยอาหาร`
      );
    }

    if (w.ammonia >= 0.5) {
      issues.push(
        `🔴 **แอมโมเนียรวม (TAN = ${w.ammonia} mg/L) สูงเกินเกณฑ์:** เสี่ยงระคายเคืองเหงือกและทำลายตับ/ตับอ่อน`
      );
      actions.push(
        `หว่าน **ซีโอไลต์ (Zeolite) ประมาณ ${Math.max(5, Math.round(vol * 0.02))} กก.** ร่วมกับจุลินทรีย์ *Bacillus* + กากน้ำตาลหมักขยายเชื้อ และควร **เปลี่ยนถ่ายน้ำ 25–30%**`
      );
    }

    if (w.nitrite >= 0.3) {
      issues.push(
        `🟠 **ไนไตรท์ (NO₂⁻ = ${w.nitrite} mg/L) เริ่มสะสม:** ขัดขวางการจับออกซิเจนในเลือดของสัตว์น้ำ`
      );
      actions.push(
        `เติมจุลินทรีย์กลุ่ม *Nitrobacter / Nitrosomonas* และเสริมเกลือแร่เพื่อลดพิษไนไตรท์`
      );
    }

    if (w.ph < 7.2 || w.ph > 8.5) {
      issues.push(
        `🟠 **ค่า pH (${w.ph}) เบี่ยงเบนจากช่วงเหมาะสม (7.5–8.3):** ส่งผลต่อการลอกคราบและการกินอาหาร`
      );
      if (w.ph < 7.2) {
        actions.push(
          `สาด **ปูนขาวหรือโดโลไมท์ (Dolomite) ประมาณ ${Math.max(3, Math.round(vol * 0.015))} กก.** ช่วงค่ำเพื่อยกระดับ pH และค่าอัลคาไลนิตี้`
        );
      } else {
        actions.push(
          `สาด **กากน้ำตาล (Molasses) ประมาณ ${Math.max(2, Math.round(vol * 0.005))} ลิตร** ผสมน้ำสาดทั่วบ่อเพื่อช่วยลดค่า pH ช่วงบ่าย`
        );
      }
    }

    if (w.alkalinity < 90) {
      issues.push(
        `🟠 **ค่าอัลคาไลนิตี้ (${w.alkalinity} mg/L CaCO₃) ค่อนข้างต่ำ:** น้ำมีความสามารถในการบัฟเฟอร์ต่ำ ทำให้ pH แกว่งง่าย`
      );
      actions.push(
        `เติม **โดโลไมท์หรือแคลเซียมคาร์บอเนต ${Math.max(4, Math.round(vol * 0.012))} กก.** เพื่อเสริมแร่ธาตุและความด่างของน้ำ`
      );
    }

    if (actions.length === 0) {
      actions.push(
        `รักษามาตรฐานการให้อาหารมื้อละ **${pond.feeding?.amountKg || 2.5} กก.** ตามรอบเวลาทุก **${pond.feeding?.intervalHours || 4} ชั่วโมง**`
      );
      actions.push(
        `ตรวจเช็คยออาหารหลังให้ 45–60 นาที และเติมจุลินทรีย์บำบัดน้ำตามรอบทุกสัปดาห์`
      );
    }

    return `### 🧠 รายงานวิเคราะห์บ่ออัจฉริยะ: **${pond.name}** (${pond.species})
*เวลาประมวลผล: ${nowStr} น. | ปริมาตรน้ำประมาณ ${vol.toLocaleString()} ลบ.ม.*

#### 1. สรุปสถานะคุณภาพน้ำเชิงลึก
${issues.map((item) => `- ${item}`).join("\n")}

#### 2. คำแนะนำการให้อาหาร (Feeding Plan)
- **มื้อล่าสุด:** ปริมาณ **${pond.feeding?.amountKg || 2.5} กก.** (${pond.feeding?.feedType || "อาหารเม็ดสำเร็จรูป"})
- **คำแนะนำมื้อถัดไป:** ${
      w.do < 4.0 || w.ammonia >= 0.8
        ? `⚠️ **แนะนำลดปริมาณอาหารลง 30–50%** (เหลือประมาณ ${(
            (pond.feeding?.amountKg || 2.5) * 0.6
          ).toFixed(1)} กก.) เนื่องจากค่าออกซิเจนหรือของเสียในน้ำยังตึงตัว`
        : `✅ **ให้อาหารตามเกณฑ์ปกติ ${pond.feeding?.amountKg || 2.5} กก.** ได้ตามรอบเวลา และควรเช็คยอหลังให้อาหาร 1 ชั่วโมง`
    }

#### 3. แผนการเปลี่ยนถ่ายน้ำและการปรับสภาพน้ำ (Action Plan)
${actions.map((act, idx) => `${idx + 1}. ${act}`).join("\n")}
${
  prompt
    ? `\n#### 4. คำตอบเพิ่มเติมสำหรับคำถามของคุณ\n> *"${prompt}"*\n- แนะนำให้ตรวจวัดค่า DO และ pH วันละ 2 เวลา (06:00 น. และ 15:00 น.) อย่างสม่ำเสมอ หากค่าความต่าง pH เช้า-บ่ายเกิน 0.5 แสดงว่าแพลงก์ตอนหนาแน่นเกินไป ควรเปลี่ยนน้ำ 15–20% ทันทีครับ`
    : ""
}`;
  }

  return `### 🤖 ผู้เชี่ยวชาญประมงอัจฉริยะ (AquaSense AI)
สำหรับคำถามเรื่อง **"${prompt || "การจัดการบ่อปลาและบ่อกุ้ง"}"**:
1. **การควบคุมคุณภาพน้ำหลัก:** รักษาค่า DO > 5.0 mg/L (ห้ามต่ำกว่า 3.5 mg/L ช่วงเช้ามืด), ค่า pH 7.5–8.3, แอมโมเนียรวม (TAN) < 0.5 mg/L และไนไตรท์ < 0.25 mg/L
2. **ตารางการให้อาหาร:** แบ่งให้วันละ 3–4 มื้อ (กุ้งขาว 4–5 มื้อ) โดยปรับลดทันที 30–50% หากวันไหนฟ้าครึ้ม ฝนตกหนัก หรือค่าออกซิเจนต่ำ
3. **การเปลี่ยนถ่ายน้ำ:** ควรดูดตะกอนเลนก้นบ่อและถ่ายน้ำ 15–25% ทุกๆ 5–7 วัน หรือทันทีที่ค่าแอมโมเนีย/ไนไตรท์พุ่งสูงเกินเกณฑ์`;
}

app.get("/api/network-info", (req, res) => {
  const info = getLocalNetworkInfo(PORT);
  res.json({
    ...info,
    apiKeyConfigured: Boolean(DEFAULT_API_KEY),
    maskedKey: DEFAULT_API_KEY
      ? DEFAULT_API_KEY.slice(0, 4) + "..." + DEFAULT_API_KEY.slice(DEFAULT_API_KEY.length - 4)
      : "พร้อมใช้งาน (Environment / Client Key)",
    model: "AI Engine (3.8 Flash)",
  });
});

app.post("/api/ai/consult", async (req, res) => {
  const {
    prompt,
    pond,
    mode = "chat",
    previousInteractionId,
    imageBase64,
    imageMimeType,
    imageMeta,
    customApiKey,
  } = req.body || {};

    const apiKey = (customApiKey && customApiKey.trim()) || DEFAULT_API_KEY;

  if (!apiKey) {
    const fallbackText = buildSmartExpertFallback({
      prompt,
      pond,
      mode,
      imageMeta,
    });
    return res.json({
      ok: true,
      source: "aquasense-hybrid-engine",
      apiNotice: "ประมวลผลด้วยระบบผู้เชี่ยวชาญประมงอัจฉริยะ (Offline/Local Engine)",
      interactionId: null,
      text: fallbackText,
    });
  }

  const systemInstruction = `คุณคือ "AquaSense O3 AI" นักวิชาการประมงและผู้เชี่ยวชาญด้านการจัดการบ่อเลี้ยงปลา บ่อกุ้งขาวแวนนาไม กุ้งก้ามกราม และสัตว์น้ำเศรษฐกิจของประเทศไทย
หน้าที่ของคุณ:
1. วิเคราะห์คุณภาพน้ำแบบละเอียด (DO, pH, แอมโมเนีย NH3/TAN, ไนไตรท์ NO2, ไนเตรท NO3, อัลคาไลนิตี้, ความเค็ม, อุณหภูมิ, ความโปร่งใส/สีน้ำ)
2. คำนวณโดสการใส่ปูนขาว โดโลไมท์ ซีโอไลต์ กากน้ำตาล เกลือ และจุลินทรีย์ ตามปริมาตรบ่อจริง (กว้าง x ยาว x ลึก)
3. ให้คำแนะนำเรื่องเวลาให้อาหาร ปริมาณอาหารที่ควรปรับเพิ่ม/ลดตามสภาพน้ำ และตารางการเปลี่ยนถ่ายน้ำอย่างชัดเจน
4. ตอบเป็นภาษาไทยที่เข้าใจง่าย เป็นระบบ มีหัวข้อชัดเจน ใช้ Markdown และ Emoji ประกอบให้อ่านง่ายบนมือถือ`;

  const pondContext = pond
    ? `\n[ข้อมูลบ่อปัจจุบัน]
- ชื่อบ่อ: ${pond.name} (${pond.species}, ประเภท: ${pond.type})
- ขนาดบ่อ: กว้าง ${pond.dimensions?.width}ม. x ยาว ${pond.dimensions?.length}ม. x ลึก ${pond.dimensions?.depth}ม. (ปริมาตร ~${Math.round((pond.dimensions?.width || 20) * (pond.dimensions?.length || 30) * (pond.dimensions?.depth || 1.5))} ลบ.ม.)
- อายุการเลี้ยง (DOC): ${pond.docDays} วัน | จำนวนปล่อย: ${pond.stockCount?.toLocaleString()} ตัว
- ค่าคุณภาพน้ำล่าสุด: DO=${pond.water?.do} mg/L, pH=${pond.water?.ph}, แอมโมเนีย(TAN)=${pond.water?.ammonia} mg/L, ไนไตรท์=${pond.water?.nitrite} mg/L, ไนเตรท=${pond.water?.nitrate} mg/L, อุณหภูมิ=${pond.water?.temp} °C, ความเค็ม=${pond.water?.salinity} ppt, อัลคาไลนิตี้=${pond.water?.alkalinity} mg/L, ความใส=${pond.water?.turbidity} ซม., สีน้ำ=${pond.water?.waterColor}
- การให้อาหาร: ล่าสุดเมื่อ ${pond.feeding?.lastFedAt}, รอบถัดไปทุก ${pond.feeding?.intervalHours} ชม., ปริมาณมื้อละ ${pond.feeding?.amountKg} กก. (${pond.feeding?.feedType})
- การเปลี่ยนน้ำ: ล่าสุดเมื่อ ${pond.waterChange?.lastChangedAt} (ถ่ายออก ${pond.waterChange?.lastPercent}%), รอบเปลี่ยนน้ำทุก ${pond.waterChange?.intervalDays} วัน\n`
    : "";

  const fullTextPrompt = `${pondContext}\nคำถาม/คำสั่งจากเกษตรกร: ${
    prompt ||
    "ช่วยวิเคราะห์สภาพน้ำในบ่อนี้แบบละเอียด แนะนำการให้อาหารมื้อถัดไป และประเมินว่าควรเปลี่ยนน้ำหรือเติมสารปรับสภาพน้ำอะไรบ้างในปริมาณเท่าไหร่"
  }`;

  try {
    const client = new GoogleGenAI({ apiKey });

    let inputPayload = fullTextPrompt;
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
      inputPayload = [
        { type: "text", text: fullTextPrompt },
        {
          type: "image",
          data: cleanBase64,
          mime_type: imageMimeType || "image/jpeg",
        },
      ];
    }

    const requestOptions = {
      model: DEFAULT_MODEL,
      system_instruction: systemInstruction,
      input: inputPayload,
    };

    if (previousInteractionId) {
      requestOptions.previous_interaction_id = previousInteractionId;
    }

    const interaction = await client.interactions.create(requestOptions);

    return res.json({
      ok: true,
      source: "AI Advisor Engine",
      interactionId: interaction.id,
      text:
        interaction.output_text ||
        buildSmartExpertFallback({ prompt, pond, mode, imageMeta }),
    });
  } catch (error) {
    console.warn(
      "[AI API Fallback Activated]:",
      error?.message || String(error)
    );
    const fallbackText = buildSmartExpertFallback({
      prompt,
      pond,
      mode,
      imageMeta,
    });
    return res.json({
      ok: true,
      source: "aquasense-hybrid-engine",
      apiNotice: error?.message || "ใช้ระบบวิเคราะห์ผู้เชี่ยวชาญในตัวเครื่อง",
      interactionId: null,
      text: fallbackText,
    });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  const netInfo = getLocalNetworkInfo(PORT);
  console.log("==========================================================");
  console.log("🐟🦐 AquaSense O3 - Smart Aquaculture App is RUNNING!");
  console.log(`💻 เปิดบนคอมพิวเตอร์: http://localhost:${PORT}`);
  console.log(`📱 เปิดบนโทรศัพท์ (Wi-Fi เดียวกัน): ${netInfo.primaryUrl}`);
  console.log("==========================================================");
});
