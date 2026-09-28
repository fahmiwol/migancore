"""Replace the cards of the earlier public repositories under Tiranyx (MiganCore 7B "soul" line and SIDIX) with
honest cards that state data provenance and archive status, and group the SIDIX adapters in a collection.
No files other than README.md are touched; no repository is deleted. The token comes from the local
`hf auth login` cache and is never printed.

    node hf/model-cards/build-legacy-cards.mjs && python hf/update_legacy_cards.py
"""
import os
import sys

from huggingface_hub import HfApi

OWNER = "Tiranyx"
HERE = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(HERE, "model-cards", "legacy")
SIDIX = ["sidix-lora", "sidix-dora-persona-v1"]

api = HfApi()
if api.whoami().get("name") != OWNER:
    sys.exit(f"Log in as {OWNER} first (`hf auth login`).")

for card in sorted(os.listdir(CARDS)):
    repo = f"{OWNER}/{card[:-3]}"
    api.upload_file(path_or_fileobj=os.path.join(CARDS, card), path_in_repo="README.md", repo_id=repo,
                    commit_message="Model card: data provenance and archive status")
    print("card:", repo)

col = api.create_collection(title="SIDIX: archived research build (Apr-Aug 2026)", namespace=OWNER,
                            description="Adapters of SIDIX, a self-hosted AI agent project whose research continued as MiganCore. Archived, not maintained.",
                            exists_ok=True)
for name in SIDIX:
    api.add_collection_item(col.slug, item_id=f"{OWNER}/{name}", item_type="model", exists_ok=True)
print("collection:", col.slug)
