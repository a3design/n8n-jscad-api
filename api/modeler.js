const { booleans, primitives, extrusions, transforms } = require('@jscad/modeling');
const { serialize } = require('@jscad/stl-serializer');

const { subtract } = booleans;
const { circle, rectangle } = primitives;
const { extrudeLinear } = extrusions;
const { translate } = transforms;

// Ana Vercel serverless fonksiyonu
module.exports = (req, res) => {
  // --- 1. İstek Doğrulama ---
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // --- 2. Gelen Veriyi (Payload) Çıkarma ve Doğrulama ---
  const modeling_plan = req.body.modeling_plan;
  if (!modeling_plan || !Array.isArray(modeling_plan) || modeling_plan.length === 0) {
    const errorMessage = "Hata: İstek gövdesinde 'modeling_plan' bulunamadı, bir dizi değil veya boş.";
    console.error(`DEBUG: ${errorMessage}`);
    return res.status(400).send(errorMessage);
  }

  // --- 3. 3D Modelleme Mantığı ---
  let finalShape;
  let currentSketch;
  // *** YENİ: Son çizimin koordinatlarını hafızada tutmak için bir değişken ***
  let lastSketchCoords = { x: 0, y: 0 };

  try {
    modeling_plan.forEach(step => {
      console.log(`DEBUG: Adım ${step.step} işleniyor: "${step.action}"`);

      switch (step.action) {
        case 'create_rectangle':
          currentSketch = rectangle({ size: [step.width, step.height] });
          // Eğer bu adımda koordinat bilgisi varsa, hafızaya al.
          if (step.x !== undefined && step.y !== undefined) {
            lastSketchCoords = { x: step.x, y: step.y };
          }
          console.log(`DEBUG: Genişlik: ${step.width}, Yükseklik: ${step.height} olan bir dikdörtgen çizimi oluşturuldu.`);
          break;

        case 'create_circle':
          currentSketch = circle({ radius: step.diameter / 2 });
          // Eğer bu adımda koordinat bilgisi varsa, hafızaya al.
          if (step.x !== undefined && step.y !== undefined) {
            lastSketchCoords = { x: step.x, y: step.y };
          }
          console.log(`DEBUG: Çap: ${step.diameter} olan bir daire çizimi oluşturuldu.`);
          break;

        case 'extrude':
          if (!currentSketch) throw new Error(`Adım ${step.step} (extrude): Ekstrüzyon için çizim bulunamadı.`);
          finalShape = extrudeLinear({ height: step.depth }, currentSketch);
          console.log(`DEBUG: Çizim, ${step.depth} derinliğine kadar uzatıldı.`);
          break;

        case 'cut_through_all':
          if (!currentSketch || !finalShape) throw new Error(`Adım ${step.step} (cut_through_all): Kesme işlemi için 'currentSketch' veya 'finalShape' mevcut değil.`);
          
          // *** DÜZELTME: Hafızadaki son koordinatları kullan ***
          const positionedSketch = translate([lastSketchCoords.x, lastSketchCoords.y, 0], currentSketch);
          
          const cuttingTool = extrudeLinear({ height: 2000 }, positionedSketch);
          const centeredCuttingTool = translate([0, 0, -1000], cuttingTool);
          
          finalShape = subtract(finalShape, centeredCuttingTool);
          console.log(`DEBUG: "cut_through_all" işlemi x:${lastSketchCoords.x}, y:${lastSketchCoords.y} koordinatlarında gerçekleştirildi.`);
          break;

        default:
          console.warn(`DEBUG: Adım ${step.step}'de bilinmeyen eylem "${step.action}". Atlanıyor.`);
      }
    });

    if (!finalShape) throw new Error("Modelleme planı işlendi ancak son bir 3D şekil üretilemedi.");

    // --- 4. STL'e Çevirme ve Yanıt Gönderme ---
    console.log('DEBUG: STL serileştirme başladı.');
    const rawData = serialize({ binary: true }, finalShape);
    console.log(`DEBUG: Serileştirme tamamlandı. STL arabellek boyutu: ${rawData.length}`);

    // Başarılı bir modelin arabellek boyutu 3'ten büyük olmalıdır.
    if (rawData.length <= 3) {
      throw new Error("Geometri hatası nedeniyle boş bir STL dosyası oluşturuldu.");
    }

    res.setHeader('Content-Type', 'application/stl');
    res.setHeader('Content-Disposition', 'attachment; filename=model.stl');
    res.status(200).send(Buffer.from(rawData));

  } catch (error) {
    console.error('FATAL ERROR: Modelleme sırasında ölümcül bir hata oluştu:', error.message);
    res.status(500).send(`Sunucu Hatası: ${error.message}`);
  }
};
