// api/modeler.js - KÜP TESTİ EKLENDİ!
const { primitives, transforms, booleans, extrusions, geometries } = require('@jscad/modeling');
const { serialize } = require('@jscad/stl-serializer');

module.exports = async function handler(request, response) {
  // Fonksiyonun çalıştığını logla
  console.log('Function invoked. Request method:', request.method);

  // Sadece POST isteklerini kabul et. Tarayıcıdan GET geldiğinde hemen 405 döndür.
  if (request.method !== 'POST') {
    return response.status(405).send('Method Not Allowed. Please use a POST request with a JSON body.');
  }

  let modelingPlan;
  try {
    if (!request.body || Object.keys(request.body).length === 0) {
       throw new Error('Request body is empty or not valid JSON.');
    }
    modelingPlan = request.body.modeling_plan;
    if (!modelingPlan || !Array.isArray(modelingPlan)) {
      throw new Error('modeling_plan property not found in request body or is not an array.');
    }
  } catch (error) {
    console.error('Body parsing failed:', error);
    return response.status(400).json({ error: 'Invalid or missing modeling_plan in request body.', details: error.message });
  }

  // Modeli oluşturmak için boş bir geometrik nesne başlat
  let finalShape = geometries.geom3.create();

  // ***** TEST KÜPÜ EKLENDİ - BU GÖRÜNMELİ! *****
  const testCube = primitives.cube({ size: 10 }); // 10 birimlik bir küp
  finalShape = booleans.union(finalShape, testCube);
  // **********************************************

  try {
    for (const step of modelingPlan) {
      const action = step.action;
      console.log(`Executing step: ${action}`);

      let newShape;

      // Adımları tanıma ve JSCAD komutlarına dönüştürme
      // NOT: Bu kısım hala basitleştirilmiş durumda, detaylı CAD komutları eklenmeli.
      if (action.includes("Draw a circle with a diameter of") && action.includes("for the head")) {
        const diameterMatch = action.match(/diameter of (\d+)/);
        if (diameterMatch) {
          const diameter = parseFloat(diameterMatch[1]);
          // Başı daha görünür bir hale getirelim
          newShape = extrusions.extrudeLinear({ height: 10 }, primitives.circle({ radius: diameter / 2, center: [0, 0] }));
        }
      } else if (action.includes("Draw two circles with a diameter of") && action.includes("for the eyes")) {
        const diameterMatch = action.match(/diameter of (\d+)/);
        if (diameterMatch) {
          const diameter = parseFloat(diameterMatch[1]);
          const eyeRadius = diameter / 2;
          const eye1 = transforms.translate([-20, 10, 5], extrusions.extrudeLinear({ height: 5 }, primitives.circle({ radius: eyeRadius })));
          const eye2 = transforms.translate([20, 10, 5], extrusions.extrudeLinear({ height: 5 }, primitives.circle({ radius: eyeRadius })));
          newShape = booleans.union(eye1, eye2);
        }
      }
      // NOT: Diğer adımlar (kuyruk, bacaklar vb.) için buraya benzer 'else if' blokları eklemen gerekecek.
      // Şu an sadece baş ve gözler için basitleştirilmiş bir örnek var.

      if (newShape) {
        finalShape = booleans.union(finalShape, newShape);
      }
    }

    // Şekli STL formatına çevir
    const serializedData = serialize({ binary: true }, finalShape);
    const stlBuffer = Buffer.from(serializedData);

    // Yanıtı ayarla
    response.setHeader('Content-Type', 'model/stl');
    response.setHeader('Content-Disposition', 'attachment; filename="model.stl"');
    response.setHeader('Access-Control-Allow-Origin', '*'); 

    // STL dosyasını yanıt olarak gönder
    return response.status(200).send(stlBuffer);

  } catch (error) {
    console.error('Modeling process crashed during execution:', error);
    return response.status(500).json({ error: 'Failed to create 3D model.', details: error.message });
  }
};
