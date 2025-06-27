// api/modeler.js - SON GÜNCEL KOD (DAHA ESNEK REGEX VE DEBUG LOGLARI)
const { primitives, transforms, booleans, extrusions, geometries } = require('@jscad/modeling');
const { serialize } = require('@jscad/stl-serializer');

module.exports = async function handler(request, response) {
  console.log('Function invoked. Request method:', request.method);

  if (request.method !== 'POST') {
    return response.status(405).send('Method Not Allowed. Please use a POST request with a JSON body.');
  }

  let modelingPlan;
  try {
    if (!request.body || (typeof request.body !== 'object' && !Array.isArray(request.body))) {
       throw new Error('Request body is empty or not a valid JSON structure.');
    }

    if (Array.isArray(request.body)) {
        modelingPlan = request.body;
    } else if (request.body.modeling_plan && Array.isArray(request.body.modeling_plan)) {
        modelingPlan = request.body.modeling_plan;
    } else {
        throw new Error('Modeling plan not found or is not an array in request body.');
    }
    
    if (!modelingPlan.length) {
        throw new Error('Modeling plan is empty.');
    }

  } catch (error) {
    console.error('Request body parsing or modeling plan extraction error:', error);
    return response.status(400).json({ error: 'Invalid or missing modeling_plan in request body.', details: error.message });
  }

  // Modeli oluşturmak için boş bir geometrik nesne başlat
  let finalShape = geometries.geom3.create();

  // ***** TEST KÜPÜ - HALA BURADA DURUYOR, TEST İÇİN İYİ *****
  const testCube = primitives.cube({ size: 10 }); // 10 birimlik bir küp
  finalShape = booleans.union(finalShape, testCube);
  console.log('DEBUG: A 10x10x10 test cube has been added to the final shape.');
  // **********************************************

  try {
    for (const step of modelingPlan) {
      const action = step.action;
      console.log(`DEBUG: Executing step: "${action}"`);

      let newShape = null; // Başlangıçta boş

      // ---- YENİ PARSİNG MANTIĞI BAŞLANGIÇ ----
      // Regex'leri daha esnek hale getiriyoruz (birimler ve kelimeler için)
      
      // 1. Daire veya Çember oluşturma
      if (action.includes("circle with a diameter of")) {
        let match = action.match(/diameter(?: of)?(?: a)? (\d+)(?:mm| units)?/);
        if (match) {
          const diameter = parseFloat(match[1]);
          newShape = extrusions.extrudeLinear({ height: 10 }, primitives.circle({ radius: diameter / 2 }));
          console.log(`DEBUG: Matched circle with diameter: ${diameter}`);
        }
      } 
      // 2. Yay (Arc) veya Kavis oluşturma
      else if (action.includes("arc with a radius of") || action.includes("arc with radius")) {
        let match = action.match(/radius of (\d+)(?:mm| units)?/);
        if (match) {
          const radius = parseFloat(match[1]);
          // Basitçe bir halka ekleyelim
          newShape = extrusions.extrudeLinear({ height: 5 }, primitives.circle({ radius: radius }));
          console.log(`DEBUG: Matched arc with radius: ${radius}`);
        }
      }
      // 3. Dikdörtgen oluşturma
      else if (action.includes("rectangle with a width of") && action.includes("height of")) {
        let match = action.match(/width of (\d+)(?:mm| units)?(?:.*?)height of (\d+)(?:mm| units)?/);
        if (match) {
          const width = parseFloat(match[1]);
          const height = parseFloat(match[2]);
          newShape = extrusions.extrudeLinear({ height: 10 }, primitives.rectangle({ size: [width, height] }));
          console.log(`DEBUG: Matched rectangle with size: ${width}x${height}`);
        }
      }
      // 4. Çizgiler oluşturma
      else if (action.includes("line with a length of") || action.includes("line of length")) {
          let match = action.match(/length of (\d+)(?:mm| units)?/);
          if (match) {
              const length = parseFloat(match[1]);
              if (action.includes("horizontal")) {
                  newShape = extrusions.extrudeLinear({ height: 1 }, primitives.rectangle({ size: [length, 1] }));
                  console.log(`DEBUG: Matched horizontal line with length: ${length}`);
              } else if (action.includes("vertical")) {
                  newShape = extrusions.extrudeLinear({ height: length }, primitives.rectangle({ size: [1, 1] }));
                  console.log(`DEBUG: Matched vertical line with length: ${length}`);
              }
          }
      }
      // 5. Extrude komutu
      else if (action.includes("Extrude the sketch")) {
          // Bu komut için önceki adımlardan bir sonuç alınması gerekir.
          // Bu bir placeholder olacak.
          console.log("DEBUG: Extrude command matched. This requires state from previous steps.");
          // Gerçek modelleme için bu adımı özel olarak kodlamak gerekir.
      }
      // 6. Basit pozisyonlandırma veya ekleme komutları
      else if (action.includes("Position") || action.includes("Add") || action.includes("Draw")) {
          console.log(`DEBUG: Found a positioning/drawing command that is not yet parsed: "${action}"`);
      }
      // ---- YENİ PARSİNG MANTIĞI BİTİŞ ----

      // Eğer bir şekil oluşturulduysa, onu ana şekille birleştir
      if (newShape) {
        finalShape = booleans.union(finalShape, newShape);
        console.log('DEBUG: newShape was added to finalShape.');
      } else {
        console.log('DEBUG: No newShape created for this step.');
      }
    }

    // Şekli STL formatına çevir
    const serializedData = serialize({ binary: true }, finalShape);
    const stlBuffer = Buffer.from(serializedData);
    console.log('DEBUG: Serialization completed. STL buffer size:', stlBuffer.length);

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
