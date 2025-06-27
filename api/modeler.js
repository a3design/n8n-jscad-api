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
  // n8n workflow'u { "modeling_plan": [...] } şeklinde bir JSON gönderir.
  // Diziyi alabilmek için .modeling_plan özelliğine erişmemiz ZORUNLUDUR.
  // *** İŞTE EN ÖNEMLİ DÜZELTME BURASI ***
  const modeling_plan = req.body.modeling_plan;

  // Modelleme planının var olup olmadığını, boş olmayan bir dizi olup olmadığını kontrol et
  if (!modeling_plan || !Array.isArray(modeling_plan) || modeling_plan.length === 0) {
    const errorMessage = "Hata: İstek gövdesinde 'modeling_plan' bulunamadı, bir dizi değil veya boş.";
    console.error(`DEBUG: ${errorMessage}`);
    return res.status(400).send(errorMessage);
  }

  // --- 3. 3D Modelleme Mantığı ---
  let finalShape;     // Son 3D nesneyi tutacak
  let currentSketch;  // Ekstrüzyon veya kesme için kullanılacak mevcut 2D çizimi (dikdörtgen, daire vb.) tutacak

  try {
    modeling_plan.forEach(step => {
      console.log(`DEBUG: Adım ${step.step} işleniyor: "${step.action}"`);

      switch (step.action) {
        case 'create_rectangle':
          // 2D bir dikdörtgen çizimi oluştur. Bu henüz 3D bir şekil değildir.
          currentSketch = rectangle({
            size: [step.width, step.height],
          });
          console.log(`DEBUG: Genişlik: ${step.width}, Yükseklik: ${step.height} olan bir dikdörtgen çizimi oluşturuldu.`);
          break;

        case 'create_circle':
          // 2D bir daire çizimi oluştur.
          // NOT: Kesme gibi işlemler için modelleme planının bu daireyi konumlandırmak
          // üzere x/y koordinatları sağlaması gerekebilir.
          currentSketch = circle({
            radius: step.diameter / 2
          });
          console.log(`DEBUG: Çap: ${step.diameter} olan bir daire çizimi oluşturuldu.`);
          break;

        case 'extrude':
          // En son oluşturulan 2D çizimi al ve ona derinlik vererek 3D bir şekle dönüştür.
          if (!currentSketch) {
            throw new Error(`Adım ${step.step} (extrude): Önce bir çizim oluşturulmadığı için ekstrüzyon yapılamıyor.`);
          }
          // Genellikle ilk ekstrüzyon işlemi ana şekli oluşturur.
          finalShape = extrudeLinear({ height: step.depth }, currentSketch);
          console.log(`DEBUG: Çizim, ${step.depth} derinliğine kadar uzatıldı.`);
          break;

        case 'cut_through_all':
          // En son oluşturulan 2D çizimi al, onu uzun bir "kesme aletine" dönüştür
          // ve ana şekilden çıkar.
          if (!currentSketch) {
            throw new Error(`Adım ${step.step} (cut_through_all): Kesilecek şekil için bir çizim oluşturulmadığından kesme yapılamıyor.`);
          }
          if (!finalShape) {
            throw new Error(`Adım ${step.step} (cut_through_all): Ana 3D şekil (finalShape) henüz oluşturulmadığı için kesme yapılamıyor.`);
          }
          
          // Çizimi konumlandır. Modelleme planı bunun için 'x' ve 'y' koordinatları sağlamalıdır.
          // Eğer sağlanmazsa merkezde (0,0) olduğu varsayılır.
          const positionedSketch = translate([step.x || 0, step.y || 0, 0], currentSketch);

          // Çizimi modelden daha uzun bir yüksekliğe uzatarak bir kesme aleti oluştur.
          const cuttingTool = extrudeLinear({ height: 2 * (step.depth || 1000) }, positionedSketch); 
          
          // Kesme aletini Z ekseninde ortalayarak her iki yönden de kesmesini garantile.
          const centeredCuttingTool = translate([0, 0, -(step.depth || 1000)], cuttingTool);

          // Aleti ana şekilden çıkar.
          finalShape = subtract(finalShape, centeredCuttingTool);
          console.log(`DEBUG: "cut_through_all" işlemi gerçekleştirildi.`);
          break;

        default:
          console.warn(`DEBUG: Adım ${step.step}'de bilinmeyen eylem "${step.action}". Atlanıyor.`);
      }
    });

    if (!finalShape) {
      throw new Error("Modelleme planı işlendi ancak son bir 3D şekil üretilemedi.");
    }

    // --- 4. STL'e Çevirme ve Yanıt Gönderme ---
    console.log('DEBUG: STL serileştirme başladı.');
    const rawData = serialize({ binary: true }, finalShape);
    console.log(`DEBUG: Serileştirme tamamlandı. STL arabellek boyutu: ${rawData.length}`);

    res.setHeader('Content-Type', 'application/stl');
    res.setHeader('Content-Disposition', 'attachment; filename=model.stl');
    res.status(200).send(Buffer.from(rawData));

  } catch (error) {
    console.error('FATAL ERROR: Modelleme sırasında ölümcül bir hata oluştu:', error.message);
    res.status(500).send(`Sunucu Hatası: ${error.message}`);
  }
};
