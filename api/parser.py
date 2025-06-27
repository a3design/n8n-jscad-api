from flask import Flask, request, jsonify
import ezdxf
import re
import io

app = Flask(__name__)

@app.route('/api/parser', methods=['POST'])
def parse_dxf():
    if 'file' not in request.files:
        return jsonify({"error": "Dosya bulunamadı"}), 400

    file = request.files['file']
    filename = file.filename

    # Adım 1: Dosya adından kalınlığı (depth) al
    depth = 10  # Varsayılan değer
    match = re.search(r'_(\d+)mm', filename)
    if match:
        depth = int(match.group(1))

    try:
        # Dosyayı hafızada oku
        doc = ezdxf.read(io.BytesIO(file.read()))
        msp = doc.modelspace()

        modeling_plan = []
        step_counter = 1

        # Adım 2: OUTLINE katmanından ana şekli bul
        base_shape_entity = msp.query('LWPOLYLINE[layer=="OUTLINE"]').first
        if not base_shape_entity:
            return jsonify({"error": "OUTLINE katmanında ana şekil bulunamadı"}), 400

        points = list(base_shape_entity.vertices())
        min_x = min(p[0] for p in points)
        max_x = max(p[0] for p in points)
        min_y = min(p[1] for p in points)
        max_y = max(p[1] for p in points)
        
        width = max_x - min_x
        height = max_y - min_y

        modeling_plan.append({"step": step_counter, "action": "create_rectangle", "width": width, "height": height})
        step_counter += 1
        modeling_plan.append({"step": step_counter, "action": "extrude", "depth": depth})
        step_counter += 1
        
        # Adım 3: CUTOUTS katmanındaki delikleri bul
        for entity in msp.query('*[layer=="CUTOUTS"]'):
            if entity.dxftype() == 'CIRCLE':
                center = entity.dxf.center
                diameter = entity.dxf.radius * 2
                modeling_plan.append({"step": step_counter, "action": "create_circle", "diameter": diameter, "x": center.x, "y": center.y})
                step_counter += 1
                modeling_plan.append({"step": step_counter, "action": "cut_through_all"})
                step_counter += 1
            
            elif entity.dxftype() == 'LWPOLYLINE':
                # Dikdörtgen slotlar için de benzer bir mantık eklenebilir
                pass

        return jsonify({"modeling_plan": modeling_plan})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
