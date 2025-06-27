// api/modeler.js - SON GÜNCEL KOD (DAHA FAZLA AKSİYONU İŞLER)
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
        modelingPlan = request.body.body.modeling_plan; // Fix path
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

  // ***** TEST KÜPÜ - HALA BURADA DURUYOR *****
  const testCube = primitives.cube({ size: 10 });
  finalShape = booleans.union(finalShape, testCube);
  // **********************************************

  try {
    for (const step of modelingPlan) {
      const action = step.action;
      console.log(`Executing step: ${action}`);

      let newShape;
      let match;

      // ---- YENİ PARSİNG MANTIĞI BURADAN BAŞLIYOR ----
      if (action.includes("Create a circle with a diameter of")) {
        match = action.match(/diameter of (\d+)/);
        if (match) {
          const diameter = parseFloat(match[1]);
          newShape = extrusions.extrudeLinear({ height: 10 }, primitives.circle({ radius: diameter / 2 }));
        }
      } else if (action.includes("Draw two circles with a diameter of")) {
        match = action.match(/diameter of (\d+)/);
        if (match) {
          const diameter = parseFloat(match[1]);
          const eyeRadius = diameter / 2;
          const eye1 = transforms.translate([-20, 10, 5], extrusions.extrudeLinear({ height: 5 }, primitives.circle({ radius: eyeRadius })));
          const eye2 = transforms.translate([20, 10, 5], extrusions.extrudeLinear({ height: 5 }, primitives.circle({ radius: eyeRadius })));
          newShape = booleans.union(eye1, eye2);
        }
      } else if (action.includes("Create a") && action.includes("rectangle with a width of") && action.includes("height of")) {
        match = action.match(/width of (\d+) units and a height of (\d+) units/);
        if (match) {
          const width = parseFloat(match[1]);
          const height = parseFloat(match[2]);
          newShape = extrusions.extrudeLinear({ height: 10 }, primitives.rectangle({ size: [width, height] }));
        }
      } else if (action.includes("Draw an arc with a radius of")) {
        match = action.match(/radius of (\d+)mm/); // Added 'mm' to match new logs
        if (match) {
            const radius = parseFloat(match[1]);
            // JSCAD'de 'arc' geometrisi biraz karmaşık. Basit bir silindir ekleyelim.
            newShape = extrusions.extrudeLinear({ height: 5 }, primitives.circle({ radius: radius }));
        }
      } else if (action.includes("Create a top arc with radius")) { // Yeni komutu işle
          match = action.match(/radius of (\d+)mm/);
          if (match) {
              const radius = parseFloat(match[1]);
              newShape = extrusions.extrudeLinear({ height: 5 }, primitives.circle({ radius: radius }));
          }
      } else if (action.includes("Draw a base horizontal line with length")) {
          match = action.match(/length of (\d+)/);
          if (match) {
              const length = parseFloat(match[1]);
              // 2D çizim, extrude edelim
              newShape = extrusions.extrudeLinear({ height: 1 }, primitives.rectangle({ size: [length, 1] }));
          }
      } else if (action.includes("Create a vertical line with a length of")) {
          match = action.match(/length of (\d+)/);
          if (match) {
              const length = parseFloat(match[1]);
              newShape = extrusions.extrudeLinear({ height: length }, primitives.rectangle({ size: [1, 1] }));
          }
      } 
      // ---- YENİ PARSİNG MANTIĞI BİTİŞ ----

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
