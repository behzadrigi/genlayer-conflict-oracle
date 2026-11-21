# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class ConflictOracle(gl.Contract):
    cases: TreeMap[str, str]
    case_count: u256

    def __init__(self):
        self.case_count = u256(0)

    # ---------- helpers ----------
    def _load(self, case_id: str) -> dict:
        assert case_id in self.cases, "case not found"
        return json.loads(self.cases[case_id])

    def _save(self, case_id: str, case: dict):
        self.cases[case_id] = json.dumps(case)

    # ---------- write methods ----------
    @gl.public.write
    def open_case(self, question: str) -> str:
        q = question.strip()
        assert len(q) >= 10, "question too short"
        assert len(q) <= 300, "question too long"
        new_id = int(self.case_count) + 1
        self.case_count = u256(new_id)
        cid = str(new_id)
        case = {
            "id": cid,
            "question": q,
            "creator": gl.message.sender_address.as_hex,
            "status": "OPEN",
            "observations": [],
            "winner": -1,
            "confidence": "",
            "reasoning": "",
        }
        self._save(cid, case)
        return cid

    @gl.public.write
    def add_observation(self, case_id: str, source: str, claim: str):
        case = self._load(case_id)
        assert case["status"] == "OPEN", "case already resolved"
        assert len(case["observations"]) < 8, "max 8 observations"
        assert len(source.strip()) >= 2, "source label required"
        assert len(claim.strip()) >= 5, "claim too short"
        case["observations"].append(
            {
                "source": source.strip()[:60],
                "claim": claim.strip()[:400],
                "by": gl.message.sender_address.as_hex,
            }
        )
        self._save(case_id, case)

    @gl.public.write
    def resolve(self, case_id: str):
        case = self._load(case_id)
        assert case["status"] == "OPEN", "case already resolved"
        assert (
            gl.message.sender_address.as_hex == case["creator"]
        ), "only the case creator can resolve"
        obs = case["observations"]
        assert len(obs) >= 2, "need at least 2 observations"

        listing = "\n".join(
            f"[{i}] source={o['source']} | claim={o['claim']}"
            for i, o in enumerate(obs)
        )
        prompt = (
            "You are an impartial arbiter. Several sources made conflicting "
            "observations about the same question.\n"
            f"Question: {case['question']}\n"
            f"Observations:\n{listing}\n\n"
            "Decide which single observation is most likely correct, judging "
            "only by internal consistency, specificity and plausibility. "
            "If none can be trusted, use -1.\n"
            'Reply with JSON only: {"winner": <int index or -1>, '
            '"confidence": "LOW" | "MEDIUM" | "HIGH", '
            '"reasoning": "<max 2 sentences>"}'
        )
        n = len(obs)

        def leader_fn():
            raw = gl.nondet.exec_prompt(prompt)
            start = raw.find("{")
            end = raw.rfind("}")
            data = json.loads(raw[start : end + 1])
            winner = int(data.get("winner", -1))
            if winner < -1 or winner >= n:
                winner = -1
            conf = str(data.get("confidence", "LOW")).upper()
            if conf not in ("LOW", "MEDIUM", "HIGH"):
                conf = "LOW"
            return {
                "winner": winner,
                "confidence": conf,
                "reasoning": str(data.get("reasoning", ""))[:300],
            }

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            mine = leader_fn()
            # consensus is on the discrete verdict (observation index or -1)
            return mine["winner"] == leader_result.calldata["winner"]

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        case["status"] = "RESOLVED"
        case["winner"] = result["winner"]
        case["confidence"] = result["confidence"]
        case["reasoning"] = result["reasoning"]
        self._save(case_id, case)

    # ---------- views ----------
    @gl.public.view
    def get_case(self, case_id: str) -> str:
        assert case_id in self.cases, "case not found"
        return self.cases[case_id]

    @gl.public.view
    def get_case_count(self) -> int:
        return int(self.case_count)
