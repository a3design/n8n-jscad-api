from flask import Flask, request, jsonify
import ezdxf
import base64
import io
import re

app = Flask(__name__)

@app.route('/api/parser', methods=['POST'])
def parse_dxf():
    try:
        json_data = request.get_json()
        if not json_data:
            print("[DEBUG] HATA: JSON body alınamadı.")
            return jsonify({"error": "JSON body bulunamadı"}), 400

        print(f"[DEBUG] Gelen JSON'ın bir kısmı: {str(json_data)[:200]}")

        if 'fileContent' not in json_data or 'fileName' not in json_data:
            print("[DEBUG] HATA: fileContent veya fileName anahtarı eksik.")
            return jsonify({"error": "Gerekli 'fileName' veya 'fileContent' alanları eksik"}), 400

        filename = json_data['fileName']
        base64_content = json_data['fileContent']
        
        # --- VERİ TİPİ KONTROLLERİ ---
        print(f"[DEBUG] 'base64_content' değişkeninin tipi: {type(base64_content)}")
        
        base64_bytes = base64_content.encode('ascii')
        print(f"[DEBUG] 'base64_bytes' değişkeninin tipi (ascii encode sonrası): {type(base64_bytes)}")
        
        decoded_content = base64.b64decode(base64_bytes)
        print(f"[DEBUG] 'decoded_content' değişkeninin tipi (base64 decode sonrası): {type(decoded_content)}")
        # --- KONTROL SONU ---

        depth = 10
        match = re.search(r'_(\d+)mm', filename)
        if match:
            depth = int(match.group(1))

        # Hata büyük ihtimalle aşağıdaki satırda oluşuyor.
        # Öncesindeki print çıktıları bize her şeyi anlatacak.
        doc = ezdxf.read(io.BytesIO(decoded_content))
        msp = doc.modelspace()

        modeling_plan = []
        step_counter = 1
        
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
                # Önceki bir hatayı düzeltme: "step" değeri sayı olmalı
                modeling_plan.append({"step": step_counter, "action": "cut_through_all"})
                step_counter += 1

        return jsonify({"modeling_plan": modeling_plan})

    except Exception as e:
        # Hatanın kendisini de loglayalım
        print(f"[FATAL ERROR] Beklenmedik Hata: {str(e)}")
        return jsonify({"error": str(e)}), 500
