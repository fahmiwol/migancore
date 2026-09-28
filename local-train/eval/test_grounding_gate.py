# E-51a isolated test — 10 hand cases ID+EN (metric pre-locked: >=9/10)
import time, sys
sys.path.insert(0, "/app/eval/nli")
from grounding_gate import assess

EV1 = ("Hasil pencarian: Presiden Indonesia saat ini adalah Prabowo Subianto, dilantik "
       "Oktober 2024. Wakil presiden adalah Gibran Rakabuming Raka. Ibu kota negara "
       "adalah Jakarta, dengan IKN Nusantara dalam proses pembangunan.")
EV2 = ("Search result: The Eiffel Tower is 330 metres tall, located in Paris, France. "
       "It was completed in 1889 and receives about 7 million visitors per year.")
cases = [
    ("Presiden Indonesia saat ini adalah Prabowo Subianto.", EV1, "entail"),
    ("Wakil presiden Indonesia adalah Gibran Rakabuming Raka.", EV1, "entail"),
    ("Presiden Indonesia saat ini adalah Joko Widodo.", EV1, "contradiction"),
    ("Prabowo dilantik pada Maret 2020.", EV1, "contradiction"),
    ("Presiden Prabowo sangat gemar bermain PlayStation setiap pagi.", EV1, "neutral"),
    ("Menara Eiffel tingginya 330 meter.", EV2, "entail"),
    ("The Eiffel Tower was completed in 1889.", EV2, "entail"),
    ("The Eiffel Tower is located in London.", EV2, "contradiction"),
    ("Menara Eiffel selesai dibangun tahun 1750.", EV2, "contradiction"),
    ("The tower has a famous restaurant run by Gordon Ramsay.", EV2, "neutral"),
]
t0 = time.time(); ok = 0
for ans, ev, exp in cases:
    r = assess(ans, ev)
    got = r["sentences"][0]["verdict"] if r["sentences"] else "SKIPPED"
    if got == exp:
        ok += 1
    s = r["sentences"][0] if r["sentences"] else {}
    print(f"{'OK ' if got==exp else 'MISS'} exp={exp:13s} got={got:13s} "
          f"e={s.get('entail','-')} c={s.get('contra','-')} :: {ans[:55]}")
print(f"SCORE {ok}/10, total {time.time()-t0:.1f}s ({(time.time()-t0)/10:.2f}s/case)")
