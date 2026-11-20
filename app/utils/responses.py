from flask import jsonify


def basarili_yanit(veri=None, durum_kodu=200):
    return jsonify({
        "basarili": True,
        "veri": veri,
    }), durum_kodu


def hata_yaniti(hata, durum_kodu=400, alanlar=None):
    govde = {
        "basarili": False,
        "hata": hata,
    }
    if alanlar is not None:
        govde["alanlar"] = alanlar
    return jsonify(govde), durum_kodu