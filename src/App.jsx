import { useState, useEffect, useRef } from "react";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const CONTRACT =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x604fF0b501Fb934AD77dA25DD4a7f0617e540Fb6";
const reader = createClient({ chain: testnetBradbury });

export default function App() {
  const writer = useRef(null);
  const [account, setAccount] = useState("");
  const [count, setCount] = useState(0);
  const [caseId, setCaseId] = useState("");
  const [data, setData] = useState(null);
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState("");
  const [claim, setClaim] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const read = (fn, args = []) =>
    reader.readContract({ address: CONTRACT, functionName: fn, args });

  async function loadCase(id) {
    const c = JSON.parse(await read("get_case", [String(id)]));
    setData(c);
    setCaseId(String(id));
    return c;
  }
  async function loadCount() {
    const n = Number(await read("get_case_count"));
    setCount(n);
    return n;
  }
  useEffect(() => { loadCount().catch(() => {}); }, []);

  async function connect() {
    if (!window.ethereum) return setMsg("Install MetaMask first.");
    const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
    writer.current = createClient({ chain: testnetBradbury, account: addr });
    try { await writer.current.connect("testnetBradbury"); } catch (e) {}
    setAccount(addr);
  }

  async function send(fn, args, precheck) {
    if (!writer.current) return setMsg("Connect your wallet first.");
    setBusy(true);
    try {
      if (precheck) {
        const err = await precheck();
        if (err) return setMsg(err);
      }
      setMsg("Confirm in your wallet...");
      const hash = await writer.current.writeContract({
        address: CONTRACT, functionName: fn, args, value: 0n,
      });
      setMsg("Waiting for validators (can take a minute)...");
      await writer.current.waitForTransactionReceipt({
        hash, status: "ACCEPTED", retries: 120, interval: 5000,
      });
      const n = await loadCount();
      await loadCase(fn === "open_case" ? n : caseId);
      setMsg("Done.");
    } catch (e) {
      setMsg("Error: " + (e.shortMessage || e.message));
    } finally {
      setBusy(false);
    }
  }

  // Pre-checks use free reads so failing (expensive) transactions are never sent.
  const needOpen = async () => {
    const c = await loadCase(caseId);
    return c.status !== "OPEN" ? "This case is already resolved." : "";
  };
  const addObs = () =>
    send("add_observation", [caseId, source, claim], async () => {
      const e = (await needOpen()) ||
        (data && data.observations.length >= 8 ? "Max 8 observations." : "") ||
        (source.trim().length < 2 ? "Source label is required." : "") ||
        (claim.trim().length < 5 ? "Claim is too short." : "");
      return e;
    });
  const resolve = () =>
    send("resolve", [caseId], async () => {
      const c = await loadCase(caseId);
      if (c.status !== "OPEN") return "This case is already resolved.";
      if (c.observations.length < 2) return "Add at least 2 observations first.";
      if (c.creator.toLowerCase() !== account.toLowerCase())
        return "Only the case creator can resolve it.";
      return "";
    });
  const openCase = () =>
    send("open_case", [question], async () =>
      question.trim().length < 10 ? "Question must be at least 10 characters." : "");

  return (
    <div className="wrap">
      <h1>ConflictOracle</h1>
      <p className="sub">
        Submit conflicting claims. GenLayer validators reach consensus on which one holds up.
      </p>

      <div className="card">
        {account ? <div className="mono">Connected: {account}</div>
          : <button onClick={connect}>Connect wallet</button>}
        <div className="mono">Contract: {CONTRACT} · Cases: {count}</div>
        <div className="msg">{msg}</div>
      </div>

      <div className="card">
        <b>1. Open a case</b>
        <input placeholder="Question, e.g. What year was the Eiffel Tower completed?"
          value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button disabled={busy} onClick={openCase}>Open case</button>
      </div>

      <div className="card">
        <b>2. Load a case</b>
        <input placeholder="Case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} />
        <button disabled={!caseId} onClick={() => loadCase(caseId).catch(() => setMsg("Case not found."))}>
          Load
        </button>
      </div>

      {data && (
        <div className="card">
          <b>Case #{data.id}: {data.question}</b>
          <div className="mono">Status: {data.status}</div>
          {data.observations.map((o, i) => (
            <div key={i} className={"obs" + (data.status === "RESOLVED" && data.winner === i ? " win" : "")}>
              <b>[{i}] {o.source}</b>: {o.claim}
              {data.status === "RESOLVED" && data.winner === i && " ✅ consensus pick"}
            </div>
          ))}
          {data.status === "RESOLVED" && (
            <p>
              {data.winner === -1 ? "No observation could be trusted." : `Winner: observation ${data.winner}`}
              {" · "}Confidence: {data.confidence}
              <br />{data.reasoning}
            </p>
          )}
          {data.status === "OPEN" && (
            <>
              <input placeholder="Source label" value={source} onChange={(e) => setSource(e.target.value)} />
              <textarea rows={2} placeholder="Claim" value={claim} onChange={(e) => setClaim(e.target.value)} />
              <button disabled={busy} onClick={addObs}>Add observation</button>{" "}
              <button disabled={busy} onClick={resolve}>Resolve by consensus</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
