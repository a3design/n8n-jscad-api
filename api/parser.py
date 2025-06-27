from flask import Flask, request, jsonify
import ezdxf
import base64  # Base64 kütüphanesini import et
import io

app = Flask(__name__)

@app.route('/api/parser', methods=['POST'])
def parse_dxf():
    # Artık request.files değil, request.get_json() kullanıyoruz
    json_data = request.get_json()
    if not json_data:
        return jsonify({"error": "JSON body bulunamadı"}), 400

    if 'fileContent' not in json_data or 'fileName' not in json_data:
        return jsonify({"error": "Gerekli 'fileName' veya 'fileContent' alanları eksik"}), 400

    filename = json_data['fileName']
    base64_content = json_data['fileContent']

    try:
        # Adım 1: Base64 metnini tekrar binary veriye dönüştür
        decoded_content = base64.b64decode(base64_content)
        
        # Adım 2: Dosya adından kalınlığı (depth) al
        depth = 10  # Varsayılan değer
        # Dosya adından kalınlık okuma mantığı aynı kalır
        match = re.search(r'_(\d+)mm', filename)
        if match:
            depth = int(match.group(1))

        # Hafızadaki binary veriyi ezdxf ile oku
        doc = ezdxf.read(io.BytesIO(decoded_content))
        msp = doc.modelspace()

        modeling_plan = []
        step_counter = 1
        
        # Geri kalan tüm DXF okuma ve JSON oluşturma mantığı birebir aynı
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
        
        for entity in msp.query('*[layer=="CUTOUTS"]'):
            if entity.dxftype() == 'CIRCLE':
                center = entity.dxf.center
                diameter = entity.dxf.radius * 2
                modeling_plan.append({"step": step_counter, "action": "create_circle", "diameter": diameter, "x": center.x, "y": center.y})
                step_counter += 1
                modeling_plan.append({"step": step_counter, "action": "cut_through_all"})
                step_counter += 1

        return jsonify({"modeling_plan": modeling_plan})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
