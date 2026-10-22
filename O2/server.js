require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const _m = (s) => Buffer.from(s, 'base64').toString('utf8');
const DEFAULT_MODEL = process.env.AI_MODEL || _m('Z2VtaW5pLTMuOC1mbGFzaA==');
const IMAGE_MODEL = process.env.IMAGE_MODEL || _m('Z2VtaW5pLW5hbm8tYmFuYW5hLTIuMQ==');
const DEFAULT_API_KEY = process.env.AI_API_KEY || process.env.API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
        results.push({
          name,
          address: iface.address,
          isWifi: /wi-fi|wlan|wireless/i.test(name),
        });
      }
    }
  }
  results.sort((a, b) => (b.isWifi ? 1 : 0) - (a.isWifi ? 1 : 0));
  return results;
}

function withTimeout(promise, ms, timeoutMessage = 'API request timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms)),
  ]);
}

const INITIAL_ZONES = [
  {
    id: 'zone-1',
    name: 'แปลงที่ 1: เมล่อนญี่ปุ่น (โรงเรือน A)',
    cropType: 'เมล่อนญี่ปุ่น (Japanese Crown Melon)',
    cameraCode: 'CAM-01 • โรงเรือน A (ทิศเหนือ)',
    growthStage: 'ระยะติดผล (อายุ 52 วัน)',
    image: '/images/zone1_melon_dry.png',
    scenarioBadge: 'ดินแห้ง / ขาดน้ำ',
    scenarioColor: 'amber',
    scenarioDescription: 'ภาพจำลองจาก AI: ดินบริเวณโคนต้นเมล่อนแห้งแตกระแหง ใบล่างเริ่มเหี่ยวลู่ลงจากความร้อนสะสมในโรงเรือน',
    sensors: {
      soilMoisture: 21,       
      nitrogen: 115,          
      phosphorus: 68,         
      potassium: 140,         
      ph: 6.4,                
      ec: 1.8,                
      soilTemp: 33.4,         
      airHumidity: 44,        
      lightLux: 48500         
    }
  },
  {
    id: 'zone-2',
    name: 'แปลงที่ 2: มะเขือเทศเชอร์รี่ (โซน B)',
    cropType: 'มะเขือเทศเชอร์รี่หวาน (Sweet Cherry Tomato)',
    cameraCode: 'CAM-02 • แปลงปลูก B (กลางแจ้ง)',
    growthStage: 'ระยะออกดอกและติดผลอ่อน (อายุ 40 วัน)',
    image: '/images/zone2_tomato_nutrient.png',
    scenarioBadge: 'ขาดแร่ธาตุอาหาร',
    scenarioColor: 'rose',
    scenarioDescription: 'ภาพจำลองจาก AI: ใบมะเขือเทศมีอาการเหลืองซีด (Chlorosis) และขอบใบไหม้สีม่วงน้ำตาล บ่งชี้การขาดไนโตรเจนและโพแทสเซียม',
    sensors: {
      soilMoisture: 58,       
      nitrogen: 32,           
      phosphorus: 24,         
      potassium: 48,          
      ph: 5.3,                
      ec: 0.65,               
      soilTemp: 27.8,         
      airHumidity: 68,        
      lightLux: 36200         
    }
  },
  {
    id: 'zone-3',
    name: 'แปลงที่ 3: สตรอว์เบอร์รี (โซน C)',
    cropType: 'สตรอว์เบอร์รีพันธุ์พระราชทาน 80',
    cameraCode: 'CAM-03 • แปลงยกร่อง C (ริมรั้ว)',
    growthStage: 'ระยะกำลังให้ผลผลิต (อายุ 65 วัน)',
    image: '/images/zone3_strawberry_anomaly.png',
    scenarioBadge: 'พบสิ่งผิดปกติในแปลง!',
    scenarioColor: 'purple',
    scenarioDescription: 'ภาพจำลองจาก AI: พบหนอนกระทู้กัดกินใบสตรอว์เบอร์รีเป็นรูแหว่ง ท่อน้ำหยดแตกมีน้ำขังแฉะ และมีแมวจรจัดเดินเข้ามาในแปลงปลูก',
    sensors: {
      soilMoisture: 86,       
      nitrogen: 95,           
      phosphorus: 72,         
      potassium: 165,         
      ph: 6.1,                
      ec: 1.55,               
      soilTemp: 24.5,         
      airHumidity: 82,        
      lightLux: 29000         
    }
  },
  {
    id: 'zone-4',
    name: 'แปลงที่ 4: ผักสลัดออร์แกนิก (โรงเรือน D)',
    cropType: 'กรีนโอ๊ค & บัตเตอร์เฮด (Organic Salad)',
    cameraCode: 'CAM-04 • โรงเรือนอัจฉริยะ D',
    growthStage: 'ระยะพร้อมเก็บเกี่ยว (อายุ 35 วัน)',
    image: '/images/zone4_salad_healthy.png',
    scenarioBadge: 'สมบูรณ์แข็งแรงดี',
    scenarioColor: 'emerald',
    scenarioDescription: 'ภาพจำลองจาก AI: ผักสลัดใบเขียวสดเป็นพุ่มสวย ดินร่วนชุ่มชื้นกำลังดี ไม่พบโรคพืชหรือแมลงรบกวน',
    sensors: {
      soilMoisture: 64,       
      nitrogen: 135,          
      phosphorus: 78,         
      potassium: 175,         
      ph: 6.5,                
      ec: 1.6,                
      soilTemp: 25.2,         
      airHumidity: 70,        
      lightLux: 31000         
    }
  }
];

function buildSmartAgronomicAnalysis(zone, sensors, customNote = '') {
  const s = sensors || zone.sensors;
  const moisture = Number(s.soilMoisture);
  const n = Number(s.nitrogen);
  const p = Number(s.phosphorus);
  const k = Number(s.potassium);
  const ph = Number(s.ph);
  const ec = Number(s.ec);
  const temp = Number(s.soilTemp);

  let shouldWater = false;
  let waterUrgency = 'ปกติ (ไม่ต้องเติมน้ำ)';
  let waterAmount = 0;
  let waterReason = '';

  if (moisture < 30) {
    shouldWater = true;
    waterUrgency = 'ด่วนมาก (วิกฤตดินแห้ง)';
    waterAmount = Number(((55 - moisture) * 0.18).toFixed(1));
    waterReason = `ความชื้นในดินต่ำเพียง ${moisture}% (ต่ำกว่าเกณฑ์มาตรฐาน 55-70%) ร่วมกับอุณหภูมิดิน ${temp}°C ทำให้ใบพืชเริ่มเหี่ยวและรากดูดซึมธาตุอาหารได้ยาก ควรเปิดระบบน้ำหยดทันที`;
  } else if (moisture < 48) {
    shouldWater = true;
    waterUrgency = 'ควรเติมน้ำภายในวันนี้';
    waterAmount = Number(((60 - moisture) * 0.14).toFixed(1));
    waterReason = `ความชื้นในดินอยู่ที่ ${moisture}% เริ่มลดต่ำกว่าระดับเหมาะสม ควรให้น้ำเพิ่มเติมเพื่อให้ดินชุ่มชื้นสม่ำเสมอ`;
  } else if (moisture > 80) {
    shouldWater = false;
    waterUrgency = 'งดให้น้ำเด็ดขาด (ดินแฉะเกินไป!)';
    waterAmount = 0;
    waterReason = `ความชื้นในดินสูงถึง ${moisture}% เสี่ยงต่อโรครากเน่าโคนเน่าและขาดออกซิเจนในชั้นดิน ควรปิดวาล์วน้ำและตรวจสอบการรั่วซึมของท่อน้ำหยด`;
  } else {
    shouldWater = false;
    waterUrgency = 'เหมาะสมดี (ไม่ต้องเติมน้ำ)';
    waterAmount = 0;
    waterReason = `ความชื้นในดินอยู่ที่ ${moisture}% อยู่ในเกณฑ์เหมาะสมที่สุดสำหรับการเจริญเติบโต (${temp}°C)`;
  }

  const deficient = [];
  if (n < 70) deficient.push(`ไนโตรเจน (N: ${n} mg/kg - ต่ำ)`);
  if (p < 45) deficient.push(`ฟอสฟอรัส (P: ${p} mg/kg - ต่ำ)`);
  if (k < 100) deficient.push(`โพแทสเซียม (K: ${k} mg/kg - ต่ำ)`);

  let shouldFertilize = deficient.length > 0 || ec < 1.0;
  let fertUrgency = 'เพียงพอ (ไม่ต้องเติมปุ๋ย)';
  let recommendedFormula = 'คงการให้ปุ๋ยตามตารางปกติ';
  let fertReason = '';

  if (deficient.length >= 2) {
    fertUrgency = 'ด่วน (ขาดแร่ธาตุหลักหลายชนิด)';
    recommendedFormula = 'ปุ๋ยสูตร 15-15-15 หรือปุ๋ยน้ำ AB เสริมธาตุอาหารรอง (Ca-Mg-B)';
    fertReason = `ตรวจพบค่าธาตุอาหารในดินต่ำกว่าเกณฑ์ ได้แก่ ${deficient.join(', ')} และค่าการนำไฟฟ้า EC เพียง ${ec} mS/cm ส่งผลให้ใบมีอาการเหลืองซีดและผลผลิตชะงักการเติบโต` + (ph < 5.6 ? ` นอกจากนี้ดินมีค่าเป็นกรด (pH ${ph}) ควรปรับด้วยโดโลไมท์เพื่อให้รากดูดปุ๋ยได้ดีขึ้น` : '');
  } else if (deficient.length === 1) {
    fertUrgency = 'แนะนำให้เสริมปุ๋ย';
    if (n < 70) recommendedFormula = 'ปุ๋ยเสริมไนโตรเจน (เช่น 46-0-0 หรือปุ๋ยหมักชีวภาพปลา)';
    else if (p < 45) recommendedFormula = 'ปุ๋ยเสริมฟอสฟอรัส (เช่น 12-24-12 บำรุงรากและดอก)';
    else recommendedFormula = 'ปุ๋ยเสริมโพแทสเซียม (เช่น 13-0-46 เร่งความหวานและขนาดผล)';
    fertReason = `แร่ธาตุ ${deficient[0]} ต่ำกว่าเกณฑ์ที่พืชต้องการในระยะ${zone.growthStage || 'ปัจจุบัน'} ควรเติมปุ๋ยเสริมเฉพาะจุด`;
  } else {
    fertReason = `ระดับแร่ธาตุในดินสมดุลดีเยี่ยม (N: ${n}, P: ${p}, K: ${k} mg/kg, EC: ${ec} mS/cm, pH: ${ph}) พืชสามารถนำไปใช้สังเคราะห์แสงได้เต็มประสิทธิภาพ`;
  }

  let hasAnomaly = false;
  let anomalySeverity = 'ปกติ (ไม่พบสิ่งผิดปกติ)';
  let detectedItems = [];
  let anomalyDetails = 'จากภาพกล้องวงจรปิดในแปลง ไม่พบสัตว์รบกวน แมลงศัตรูพืชระบาด หรือความเสียหายของอุปกรณ์';
  let immediateAction = 'เฝ้าระวังตามปกติผ่านระบบกล้อง AI ทุก 1 ชั่วโมง';
  const visualObservations = [];

  const combinedText = `${zone.id} ${zone.name} ${zone.scenarioDescription} ${customNote}`.toLowerCase();

  if (combinedText.includes('zone-3') || combinedText.includes('หนอน') || combinedText.includes('แมว') || combinedText.includes('รั่ว') || moisture > 80) {
    hasAnomaly = true;
    anomalySeverity = 'ต้องเข้าตรวจสอบทันที (ระดับสูง)';
    detectedItems = [
      '🐛 พบหนอนแมลงศัตรูพืชกัดกินใบสตรอว์เบอร์รีเป็นรูพรุน',
      '💧 ท่อระบบน้ำหยดแตก/รั่ว มีแอ่งน้ำขังแฉะในร่องแปลง',
      '🐈 พบสัตว์เลี้ยง/แมวจรจัดเดินเข้ามาเหยียบย่ำในแปลงปลูก'
    ];
    anomalyDetails = 'กล้อง AI ตรวจจับความผิดปกติ 3 รายการในแปลง: (1) มีหนอนกัดกินใบพืชหลายจุด (2) ท่อน้ำหยดมีน้ำรั่วซึมจนดินแฉะ (สอดคล้องกับความชื้นดินที่พุ่งสูงถึง ' + moisture + '%) และ (3) มีแมวเดินเข้ามาในพื้นที่เพาะปลูก';
    immediateAction = '1. ปิดวาล์วน้ำโซน C และซ่อมจุดที่ท่อน้ำหยดรั่ว 2. ฉีดพ่นสารชีวภัณฑ์ บีที (Bacillus thuringiensis) หรือน้ำส้มควันไม้กำจัดหนอน 3. ตรวจสอบรั้วตาข่ายกันสัตว์เข้าแปลง';
    visualObservations.push(
      'พบรอยแหว่งบนใบสตรอว์เบอร์รีจากการถูกหนอนกัดกินชัดเจน',
      'ผิวดินบริเวณท่อน้ำหยดมีน้ำเจิ่งนองผิดปกติ',
      'ตรวจพบสิ่งมีชีวิต (แมวสีส้ม) เคลื่อนไหวอยู่ในแปลงปลูก'
    );
  } else if (combinedText.includes('zone-1') || moisture < 32) {
    hasAnomaly = moisture < 25;
    anomalySeverity = moisture < 25 ? 'เฝ้าระวังความเครียดจากความร้อนและภัยแล้ง' : 'ปกติ';
    detectedItems = moisture < 25 ? ['☀️ ดินแห้งแตกระแหงและใบพืชเริ่มเหี่ยวเฉาจากความร้อนสะสม'] : [];
    anomalyDetails = moisture < 25
      ? 'จากภาพกล้องเห็นผิวดินแห้งเป็นสีน้ำตาลอ่อนและมีรอยแตกระแหง ใบเมล่อนเริ่มลู่ลงเนื่องจากขาดน้ำและอุณหภูมิในโรงเรือนสูง'
      : 'ไม่พบศัตรูพืชหรือสิ่งแปลกปลอมในแปลง แต่พบสัญญาณพืชขาดน้ำจากภาพกล้อง';
    immediateAction = 'สั่งเปิดระบบน้ำหยดอัตโนมัติ และเปิดพัดลมระบายอากาศในโรงเรือน';
    visualObservations.push(
      'ผิวดินบริเวณโคนต้นแห้งเป็นสีน้ำตาลอ่อนและมีรอยแยก',
      'ใบเมล่อนบางส่วนเริ่มสูญเสียความเต่งตึง (Wilting)',
      'ระบบท่อน้ำหยดอยู่ในสภาพปกติแต่ไม่มีน้ำหยด'
    );
  } else if (combinedText.includes('zone-2') || deficient.length > 0) {
    hasAnomaly = true;
    anomalySeverity = 'พบอาการผิดปกติของใบพืช (ขาดธาตุอาหาร)';
    detectedItems = ['🍂 ใบเหลืองซีด (Chlorosis) และขอบใบมีสีม่วง/น้ำตาล'];
    anomalyDetails = 'จากภาพกล้องพบใบมะเขือเทศเปลี่ยนเป็นสีเหลืองซีดตั้งแต่ใบล่างขึ้นไป สอดคล้องกับค่าเซนเซอร์ N-P-K ในดินที่ต่ำมาก';
    immediateAction = 'ให้ปุ๋ยทางระบบน้ำหยด (Fertigation) ร่วมกับการพ่นปุ๋ยทางใบเพื่อฟื้นฟูอาการใบเหลืองอย่างรวดเร็ว';
    visualObservations.push(
      'ใบมะเขือเทศมีสีเหลืองซีดและขอบใบไหม้ชัดเจน',
      'ผลมะเขือเทศมีขนาดเล็กกว่าเกณฑ์อายุ 40 วัน',
      'ความชื้นดินอยู่ในเกณฑ์ดี ไม่พบสัตว์หรือแมลงศัตรูพืชรุนแรง'
    );
  } else {
    visualObservations.push(
      'ทรงพุ่มและสีใบเขียวสดสม่ำเสมอ ไม่พบอาการใบเหลืองหรือใบไหม้',
      'ผิวดินมีสีเข้มชุ่มชื้นกำลังดี ระบบเซนเซอร์และหัวพ่นหมอกทำงานปกติ',
      'ไม่พบแมลงศัตรูพืช วัชพืช หรือสิ่งแปลกปลอมในแปลงปลูก'
    );
  }

  if (customNote) {
    visualObservations.push(`บันทึกเพิ่มเติมจากผู้ใช้: "${customNote}"`);
  }

  let score = 95;
  if (moisture < 30 || moisture > 80) score -= 32;
  else if (moisture < 45 || moisture > 75) score -= 15;
  score -= deficient.length * 14;
  if (ph < 5.5 || ph > 7.2) score -= 8;
  if (hasAnomaly && detectedItems.length >= 2) score -= 25;
  score = Math.max(18, Math.min(98, Math.round(score)));

  let overallStatus = 'สุขภาพแปลงสมบูรณ์ดีเยี่ยม';
  if (score < 45) overallStatus = 'ต้องได้รับการแก้ไขเร่งด่วน (วิกฤต)';
  else if (score < 75) overallStatus = 'ควรดูแลเพิ่มเติม (เฝ้าระวัง)';

  const actionPlan = [];
  if (shouldWater) {
    actionPlan.push(`💧 เติมน้ำทันทีประมาณ ${waterAmount} ลิตร/ตร.ม. เพื่อเพิ่มความชื้นดินจาก ${moisture}% สู่ระดับ 60%`);
  } else if (moisture > 80) {
    actionPlan.push(`🚰 ปิดระบบให้น้ำชั่วคราว และซ่อมแซมท่อน้ำหยดเพื่อลดความชื้นดินจาก ${moisture}%`);
  } else {
    actionPlan.push(`✅ รักษาระดับการให้น้ำตามปกติ (ความชื้นดิน ${moisture}% เหมาะสมแล้ว)`);
  }

  if (shouldFertilize) {
    actionPlan.push(`🌱 เติมปุ๋ย ${recommendedFormula} เพื่อชดเชย ${deficient.join(' และ ') || 'แร่ธาตุในดิน'}`);
  } else {
    actionPlan.push(`✅ แร่ธาตุ N-P-K สมดุลดี ไม่จำเป็นต้องใส่ปุ๋ยเพิ่มในสัปดาห์นี้`);
  }

  if (ph < 5.6) {
    actionPlan.push(`⚖️ ปรับสภาพดินกรด (pH ${ph}) ด้วยปูนโดโลไมท์ 50-100 กรัม/ตร.ม.`);
  }

  if (hasAnomaly) {
    actionPlan.push(`🔍 จัดการสิ่งผิดปกติ: ${immediateAction}`);
  }

  const summaryThai = `ผลการวิเคราะห์ ${zone.name} (${zone.cropType}): คะแนนสุขภาพแปลงอยู่ที่ ${score}/100 (${overallStatus}) — ` +
    (shouldWater ? `ควรเติมน้ำ (${waterUrgency}) ` : moisture > 80 ? `ควรงดให้น้ำเนื่องจากดินแฉะเกินไป ` : `น้ำเพียงพอแล้ว `) +
    (shouldFertilize ? `และควรเติมปุ๋ยเสริมเนื่องจาก${deficient.join(', ')} ` : `แร่ธาตุอาหารในดินสมบูรณ์ดี `) +
    (hasAnomaly ? `ทั้งนี้ตรวจพบสิ่งผิดปกติจากกล้องคือ ${detectedItems.join(', ')} ซึ่งควรดำเนินการแก้ไขทันที` : `และไม่พบสิ่งแปลกปลอมหรือศัตรูพืชในภาพจากกล้อง`);

  return {
    healthScore: score,
    overallStatus,
    waterAssessment: {
      shouldWater,
      urgency: waterUrgency,
      recommendedAmountLitersPerSqm: waterAmount,
      reason: waterReason
    },
    fertilizerAssessment: {
      shouldFertilize,
      urgency: fertUrgency,
      recommendedFormula,
      deficientMinerals: deficient.length > 0 ? deficient : ['แร่ธาตุ N-P-K อยู่ในเกณฑ์สมบูรณ์'],
      reason: fertReason
    },
    anomalyAssessment: {
      hasAnomaly,
      severity: anomalySeverity,
      detectedItems: detectedItems.length > 0 ? detectedItems : ['ไม่พบสิ่งแปลกปลอม ศัตรูพืช หรือความผิดปกติในแปลง'],
      details: anomalyDetails,
      immediateAction
    },
    visualObservations,
    actionPlan,
    summaryThai
  };
}

app.get('/api/network-info', async (req, res) => {
  try {
    const ips = getLocalIPs();
    const primaryIp = ips.length > 0 ? ips[0].address : 'localhost';
    const mobileUrl = `http://${primaryIp}:${PORT}`;
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#064e3b',
        light: '#ffffff'
      }
    });

    res.json({
      port: PORT,
      primaryIp,
      mobileUrl,
      allIps: ips.map(i => ({ name: i.name, address: i.address, url: `http://${i.address}:${PORT}` })),
      qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/zones', (req, res) => {
  res.json({ zones: INITIAL_ZONES });
});

app.post('/api/analyze', async (req, res) => {
  const { zone, sensors, customNote, customImageBase64, apiKey } = req.body;
  const activeKey = (apiKey || DEFAULT_API_KEY).trim();
  const s = sensors || zone?.sensors || {};

  try {
    if (!activeKey) {
      throw new Error('API key not provided (running in smart simulation mode)');
    }
    const ai = new GoogleGenAI({ apiKey: activeKey });

    let base64Image = null;
    let mimeType = 'image/png';

    if (customImageBase64 && customImageBase64.startsWith('data:')) {
      const matches = customImageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Image = matches[2];
      }
    } else if (zone?.image) {
      const localImagePath = path.join(__dirname, 'public', zone.image.replace(/^\//, ''));
      if (fs.existsSync(localImagePath)) {
        const fileBuffer = fs.readFileSync(localImagePath);
        base64Image = fileBuffer.toString('base64');
        const isJpeg = fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8;
        mimeType = isJpeg ? 'image/jpeg' : 'image/png';
      }
    }

    const promptText = `คุณคือผู้เชี่ยวชาญด้านเกษตรอัจฉริยะ (Smart Farm AI Agronomist)
จงวิเคราะห์ข้อมูลจากเซนเซอร์ในดินและภาพจากกล้องวงจรปิดในสวนต่อไปนี้อย่างละเอียด (ตอบเป็นภาษาไทยทั้งหมด):

ข้อมูลแปลงเกษตร:
- ชื่อแปลง: ${zone?.name || 'แปลงเกษตรสาธิต'}
- ชนิดพืช: ${zone?.cropType || 'พืชเศรษฐกิจ'}
- ระยะการเจริญเติบโต: ${zone?.growthStage || 'กำลังเจริญเติบโต'}
- รายละเอียดสถานการณ์กล้อง: ${zone?.scenarioDescription || ''}
${customNote ? `- ข้อมูลเพิ่มเติมจากเกษตรกร: ${customNote}` : ''}

ค่าเซนเซอร์ตรวจวัดล่าสุด:
- ความชื้นในดิน (Soil Moisture): ${s.soilMoisture}% (ค่าเหมาะสมทั่วไป 55-70%)
- ไนโตรเจน (N): ${s.nitrogen} mg/kg (ค่าเหมาะสม 100-150 mg/kg)
- ฟอสฟอรัส (P): ${s.phosphorus} mg/kg (ค่าเหมาะสม 60-90 mg/kg)
- โพแทสเซียม (K): ${s.potassium} mg/kg (ค่าเหมาะสม 140-200 mg/kg)
- ค่าความเป็นกรด-ด่างของดิน (pH): ${s.ph} (ค่าเหมาะสม 6.0-6.8)
- ค่าการนำไฟฟ้า (EC): ${s.ec} mS/cm
- อุณหภูมิดิน: ${s.soilTemp} °C
- ความชื้นสัมพัทธ์ในอากาศ: ${s.airHumidity}%
- ความเข้มแสง: ${s.lightLux} Lux

กรุณาวิเคราะห์และตอบคำถามสำคัญ 3 ข้อนี้พร้อมแผนปฏิบัติการ:
1. ต้นนี้ควรเติมน้ำไหม? ปริมาณเท่าไหร่ และเร่งด่วนแค่ไหน?
2. ต้นนี้ควรเติมปุ๋ยหรือแร่ธาตุใดเพิ่มไหม? สูตรไหน?
3. ในภาพจากกล้องและข้อมูลเซนเซอร์ มีอะไรแปลกๆ หรือสิ่งผิดปกติเกิดขึ้นไหม (เช่น โรคพืช ใบเหลือง หนอนแมลง สัตว์บุกรุก ท่อน้ำรั่ว ดินแตกระแหง)?`;

    const inputContent = [];
    if (base64Image) {
      inputContent.push({
        type: 'image',
        data: base64Image,
        mime_type: mimeType
      });
    }
    inputContent.push({
      type: 'text',
      text: promptText
    });

    const interaction = await withTimeout(
      ai.interactions.create({
        model: DEFAULT_MODEL,
        input: inputContent,
        generation_config: {
          thinking_level: 'low'
        },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: {
              healthScore: { type: 'number', description: 'คะแนนสุขภาพแปลง 0-100' },
              overallStatus: { type: 'string', description: 'สถานะภาพรวมของแปลง' },
              waterAssessment: {
                type: 'object',
                properties: {
                  shouldWater: { type: 'boolean' },
                  urgency: { type: 'string' },
                  recommendedAmountLitersPerSqm: { type: 'number' },
                  reason: { type: 'string' }
                },
                required: ['shouldWater', 'urgency', 'recommendedAmountLitersPerSqm', 'reason']
              },
              fertilizerAssessment: {
                type: 'object',
                properties: {
                  shouldFertilize: { type: 'boolean' },
                  urgency: { type: 'string' },
                  recommendedFormula: { type: 'string' },
                  deficientMinerals: { type: 'array', items: { type: 'string' } },
                  reason: { type: 'string' }
                },
                required: ['shouldFertilize', 'urgency', 'recommendedFormula', 'deficientMinerals', 'reason']
              },
              anomalyAssessment: {
                type: 'object',
                properties: {
                  hasAnomaly: { type: 'boolean' },
                  severity: { type: 'string' },
                  detectedItems: { type: 'array', items: { type: 'string' } },
                  details: { type: 'string' },
                  immediateAction: { type: 'string' }
                },
                required: ['hasAnomaly', 'severity', 'detectedItems', 'details', 'immediateAction']
              },
              visualObservations: { type: 'array', items: { type: 'string' } },
              actionPlan: { type: 'array', items: { type: 'string' } },
              summaryThai: { type: 'string' }
            },
            required: [
              'healthScore',
              'overallStatus',
              'waterAssessment',
              'fertilizerAssessment',
              'anomalyAssessment',
              'visualObservations',
              'actionPlan',
              'summaryThai'
            ]
          }
        }
      }),
      18000,
      'AI API timeout'
    );

    const parsed = JSON.parse(interaction.output_text);
    return res.json({
      source: 'Multimodal AI (Live API)',
      interactionId: interaction.id,
      analysis: parsed
    });
  } catch (err) {
    console.warn('AI Live API fallback triggered:', err.message);
    const fallbackAnalysis = buildSmartAgronomicAnalysis(zone || INITIAL_ZONES[0], s, customNote);
    return res.json({
      source: 'O2 Smart Agronomist AI Engine (Hybrid Mode)',
      apiNotice: err.message,
      analysis: fallbackAnalysis
    });
  }
});

app.post('/api/generate-camera', async (req, res) => {
  const { prompt, scenarioPreset, apiKey } = req.body;
  const activeKey = (apiKey || DEFAULT_API_KEY).trim();

  const presetPrompts = {
    dry: 'Realistic smart greenhouse security camera view of rows of vegetable plants with visibly dry, cracked light-brown soil and wilting drooping leaves under bright sunlight, drip irrigation tubes dry.',
    nutrient: 'Realistic farm camera view of crop plants in soil beds where leaves have severe yellowing chlorosis and brown scorched edges from nitrogen and potassium deficiency.',
    pest: 'Realistic garden CCTV camera view of vegetable beds with green caterpillars chewing holes in leaves, a leaking black water pipe creating a puddle, and a curious dog or cat near the garden bed.',
    healthy: 'Realistic smart farm camera view of vibrant, lush green organic vegetables growing in dark moist rich soil with IoT soil sensors and misting nozzles.'
  };

  const fullPrompt = prompt
    ? `Realistic smart farm CCTV monitoring camera view of an agricultural garden plot: ${prompt}. High detail, natural daylight, authentic security camera perspective.`
    : presetPrompts[scenarioPreset] || presetPrompts.healthy;

  try {
    if (!activeKey) {
      throw new Error('API key not provided (running in smart simulation mode)');
    }
    const ai = new GoogleGenAI({ apiKey: activeKey });
    const interaction = await withTimeout(
      ai.interactions.create({
        model: IMAGE_MODEL,
        input: fullPrompt,
        response_format: [
          {
            type: 'image',
            aspect_ratio: '16:9',
            mime_type: 'image/jpeg'
          }
        ]
      }),
      20000,
      'Image generation timeout'
    );

    const imgObj = interaction.output_image;
    if (imgObj && imgObj.data) {
      const fileName = `ai_cam_${Date.now()}.jpg`;
      const savePath = path.join(__dirname, 'public', 'images', fileName);
      fs.mkdirSync(path.dirname(savePath), { recursive: true });
      fs.writeFileSync(savePath, Buffer.from(imgObj.data, 'base64'));
      return res.json({
        success: true,
        source: 'Multimodal Image AI',
        imageUrl: `/images/${fileName}`,
        promptUsed: fullPrompt
      });
    }
    throw new Error('No image returned from model');
  } catch (err) {
    console.warn('Live image generation fallback:', err.message);
    
    const pLower = (prompt || scenarioPreset || '').toLowerCase();
    let fallbackImage = '/images/zone1_melon_dry.png';
    if (pLower.includes('เหลือง') || pLower.includes('ปุ๋ย') || pLower.includes('nutrient') || scenarioPreset === 'nutrient') {
      fallbackImage = '/images/zone2_tomato_nutrient.png';
    } else if (pLower.includes('หนอน') || pLower.includes('แมว') || pLower.includes('แมลง') || pLower.includes('รั่ว') || pLower.includes('แปลก') || scenarioPreset === 'pest') {
      fallbackImage = '/images/zone3_strawberry_anomaly.png';
    } else if (pLower.includes('สมบูรณ์') || pLower.includes('เขียว') || pLower.includes('healthy') || scenarioPreset === 'healthy') {
      fallbackImage = '/images/zone4_salad_healthy.png';
    }

    return res.json({
      success: true,
      source: 'AI Pre-Generated Farm Camera Library',
      imageUrl: fallbackImage,
      promptUsed: fullPrompt,
      notice: err.message
    });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, previousInteractionId, zone, sensors, apiKey } = req.body;
  const activeKey = (apiKey || DEFAULT_API_KEY).trim();
  const s = sensors || zone?.sensors || {};

  const systemInstruction = `คุณคือ "O2 Smart Farm AI" นักวิชาการเกษตรอัจฉริยะประจำฟาร์ม ตอบคำถามเป็นภาษาไทยที่เข้าใจง่าย กระชับ เป็นกันเอง และอ้างอิงจากค่าเซนเซอร์ปัจจุบันของแปลง:
- แปลงที่กำลังดู: ${zone?.name || 'แปลงสาธิต'} (${zone?.cropType || ''})
- ความชื้นในดิน: ${s.soilMoisture}% | อุณหภูมิดิน: ${s.soilTemp}°C | ความชื้นอากาศ: ${s.airHumidity}%
- แร่ธาตุในดิน: ไนโตรเจน (N) = ${s.nitrogen} mg/kg, ฟอสฟอรัส (P) = ${s.phosphorus} mg/kg, โพแทสเซียม (K) = ${s.potassium} mg/kg
- ค่า pH ดิน: ${s.ph} | ค่า EC: ${s.ec} mS/cm
- สถานการณ์ภาพจากกล้อง: ${zone?.scenarioDescription || ''}`;

  try {
    if (!activeKey) {
      throw new Error('API key not provided (running in smart simulation mode)');
    }
    const ai = new GoogleGenAI({ apiKey: activeKey });
    const reqParams = {
      model: DEFAULT_MODEL,
      system_instruction: systemInstruction,
      input: message,
      generation_config: {
        thinking_level: 'low'
      }
    };
    if (previousInteractionId) {
      reqParams.previous_interaction_id = previousInteractionId;
    }

    const interaction = await withTimeout(
      ai.interactions.create(reqParams),
      15000,
      'Chat API timeout'
    );

    return res.json({
      reply: interaction.output_text,
      interactionId: interaction.id,
      source: 'Multimodal AI'
    });
  } catch (err) {
    
    const analysis = buildSmartAgronomicAnalysis(zone || INITIAL_ZONES[0], s);
    const q = (message || '').toLowerCase();
    let reply = '';

    if (q.includes('น้ำ') || q.includes('ชื้น') || q.includes('รดน้ำ')) {
      reply = `💧 **วิเคราะห์การให้น้ำ (${zone?.name || 'แปลงนี้'}):**\n` +
        `- ความชื้นในดินปัจจุบันอยู่ที่ **${s.soilMoisture}%** (อุณหภูมิดิน ${s.soilTemp}°C)\n` +
        `- **คำแนะนำ:** ${analysis.waterAssessment.urgency} — ${analysis.waterAssessment.reason}` +
        (analysis.waterAssessment.shouldWater ? `\n- **ปริมาณที่แนะนำ:** ควรเปิดระบบน้ำหยดเติมน้ำประมาณ **${analysis.waterAssessment.recommendedAmountLitersPerSqm} ลิตร/ตร.ม.** ครับ` : '');
    } else if (q.includes('ปุ๋ย') || q.includes('แร่ธาตุ') || q.includes('เหลือง') || q.includes('npk')) {
      reply = `🌱 **วิเคราะห์แร่ธาตุและปุ๋ย (${zone?.name || 'แปลงนี้'}):**\n` +
        `- ค่าแร่ธาตุปัจจุบัน: **N = ${s.nitrogen}**, **P = ${s.phosphorus}**, **K = ${s.potassium} mg/kg** (pH ${s.ph}, EC ${s.ec} mS/cm)\n` +
        `- **สถานะ:** ${analysis.fertilizerAssessment.urgency}\n` +
        `- **สูตรปุ๋ยที่แนะนำ:** ${analysis.fertilizerAssessment.recommendedFormula}\n` +
        `- **เหตุผล:** ${analysis.fertilizerAssessment.reason}`;
    } else if (q.includes('แปลก') || q.includes('ผิดปกติ') || q.includes('กล้อง') || q.includes('หนอน') || q.includes('แมลง') || q.includes('โรค')) {
      reply = `📹 **ผลการตรวจจับสิ่งผิดปกติจากกล้องวงจรปิด AI:**\n` +
        `- **สถานะ:** ${analysis.anomalyAssessment.severity}\n` +
        `- **สิ่งที่ตรวจพบ:** ${analysis.anomalyAssessment.detectedItems.join(' / ')}\n` +
        `- **รายละเอียด:** ${analysis.anomalyAssessment.details}\n` +
        `- **การแก้ไขเร่งด่วน:** ${analysis.anomalyAssessment.immediateAction}`;
    } else {
      reply = `🌿 **สรุปผลวิเคราะห์ ${zone?.name || 'แปลงเกษตร'} (คะแนนสุขภาพ ${analysis.healthScore}/100):**\n\n` +
        `1. **การให้น้ำ:** ${analysis.waterAssessment.shouldWater ? `ควรเติมน้ำ (${analysis.waterAssessment.recommendedAmountLitersPerSqm} ลิตร/ตร.ม.)` : 'ไม่ต้องเติมน้ำ'} — ${analysis.waterAssessment.reason}\n` +
        `2. **การใส่ปุ๋ย:** ${analysis.fertilizerAssessment.shouldFertilize ? `ควรเติม ${analysis.fertilizerAssessment.recommendedFormula}` : 'แร่ธาตุ N-P-K สมบูรณ์ดีแล้ว'}\n` +
        `3. **สิ่งที่พบในกล้อง:** ${analysis.anomalyAssessment.details}\n\n` +
        `คุณสามารถพิมพ์ถามเจาะจง เช่น *"ควรใส่ปุ๋ยสูตรไหน"*, *"ต้องรดน้ำกี่ลิตร"*, หรือ *"ในภาพมีตัวอะไรแปลกๆ ไหม"* ได้เลยครับ!`;
    }

    return res.json({
      reply,
      interactionId: null,
      source: 'O2 Smart Agronomist Engine'
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('====================================================');
  console.log('🌱 O2 Smart Farm AI - Agriculture Demo App Running!');
  console.log(`💻 เปิดบนคอมพิวเตอร์: http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📱 เปิดบนโทรศัพท์มือถือ (${ip.name}): http://${ip.address}:${PORT}`);
  });
  console.log('====================================================');
});
