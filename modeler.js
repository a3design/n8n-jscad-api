// api/modeler.js
import { primitives, transforms, booleans, extrusions, geometries } from '@jscad/modeling';
import { serialize } from '@jscad/stl-serializer';

export default async function handler(request, response) {
  // Sadece POST isteklerini kabul et
  if (request.method !== 'POST') {
    return response.status(405).send('Method Not Allowed');
  }

  // İstek gövdesini (body) al ve JSON olarak ayrıştır
  let modelingPlan;
  try {
    modelingPlan = request.body.modeling_plan;
    if (!modelingPlan || !Array.isArray(modelingPlan)) {
      throw new Error('Modeling plan not found in request body or is not an array.');
    }
  } catch (error) {
    console.error('Request body parsing error:', error);
    return response.status(400).json({ error: 'Invalid or missing modeling_plan in request body.' });
  }

  // Modeli oluşturmak için boş bir geometrik nesne başlat
  let finalShape = geometries.geom3.create();

  try {
    // ChatGPT'den gelen her adımı tek tek işle
    for (const step of modelingPlan) {
      const action = step.action;
      console.log(`Executing step: ${action}`);

      let newShape;

      // Adımları tanıma ve JSCAD komutlarına dönüştürme
      if (action.includes("Create a circle for the head")) {
        const diameterMatch = action.match(/diameter of (\d+)mm/);
        if (diameterMatch) {
          const diameter = parseFloat(diameterMatch[1]);
          // JSCAD'de 2D daireyi oluştur ve kalınlık ver (extrude et)
          newShape = extrusions.extrudeLinear({ height: 10 }, primitives.circle({ radius: diameter / 2, center: [0, 0] }));
        }
      } else if (action.includes("Add two eyes by creating circles")) {
        const diameterMatch = action.match(/diameter (\d+)mm/);
        if (diameterMatch) {
          const diameter = parseFloat(diameterMatch[1]);
          const eyeRadius = diameter / 2;
          const eye1 = transforms.translate([-25, 5, 5], extrusions.extrudeLinear({ height: 10 }, primitives.circle({ radius: eyeRadius })));
          const eye2 = transforms.translate([25, 5, 5], extrusions.extrudeLinear({ height: 10 }, primitives.circle({ radius: eyeRadius })));
          
          // Gözleri birleştir ve tek bir şekil haline getir
          newShape = booleans.union(eye1, eye2);
        }
      } else if (action.includes("Draw the base rectangle")) {
        const dimsMatch = action.match(/dimensions (\d+)mm x (\d+)mm/);
        if (dimsMatch) {
            const width = parseFloat(dimsMatch[1]);
            const height = parseFloat(dimsMatch[2]);
            // JSCAD'de dikdörtgen oluştur ve kalınlık ver
            newShape = extrusions.extrudeLinear({ height: 10 }, primitives.rectangle({ size: [width, height], center: [0, -30] }));
        }
      } else if (action.includes("Draw the body by creating arcs")) {
          // Bu adım biraz daha karmaşık. Arc'ları birleştirmek için daha fazla kod gerekir.
          // Basitçe birleştirilmiş bir şekil ekleyelim.
          console.log("-> Body arc step is complex, skipping for simplicity in this version.");
      }

      // Yeni oluşturulan şekli ana şekle ekle
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
    response.setHeader('Access-Control-Allow-Origin', '*'); // N8n'den gelen istekleri kabul et

    // STL dosyasını yanıt olarak gönder
    return response.status(200).send(stlBuffer);

  } catch (error) {
    console.error('Modeling process error:', error);
    return response.status(500).json({ error: 'Failed to create 3D model.', details: error.message });
  }
}