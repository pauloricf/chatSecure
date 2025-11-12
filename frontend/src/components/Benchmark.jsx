import React, { useState } from 'react';
import CryptoJS from 'crypto-js';
import { Blowfish } from 'egoroof-blowfish';
import * as twofish from 'twofish';

const Benchmark = () => {
  const [payloadKB, setPayloadKB] = useState(1024);
  const [iterations, setIterations] = useState(3);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const genText = (sizeKB) => {
    const size = sizeKB * 1024;
    const chunk = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    while (s.length < size) s += chunk;
    return s.slice(0, size);
  };

  const getHeap = () => {
    const m = performance && performance.memory ? performance.memory : null;
    return m ? m.usedJSHeapSize : null;
  };

  const toMB = (bytes) => bytes / (1024 * 1024);

  const runAES = async (text, iters) => {
    const key = CryptoJS.lib.WordArray.random(32);
    const iv = CryptoJS.lib.WordArray.random(16);
    let encTime = 0;
    let decTime = 0;
    let heapBefore = getHeap();
    let lastCipher;
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      lastCipher = CryptoJS.AES.encrypt(text, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
      encTime += performance.now() - t0;
    }
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      const dec = CryptoJS.AES.decrypt(lastCipher, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
      dec.toString(CryptoJS.enc.Utf8);
      decTime += performance.now() - t0;
    }
    let heapAfter = getHeap();
    return { encTime, decTime, heapDelta: heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null };
  };

  const runBlowfish = async (text, iters) => {
    const ivBytes = new Uint8Array(8);
    crypto.getRandomValues(ivBytes);
    const bf = new Blowfish('benchmark-key', Blowfish.MODE.CBC, Blowfish.PADDING.PKCS5);
    bf.setIv(ivBytes);
    let encTime = 0;
    let decTime = 0;
    let heapBefore = getHeap();
    let cipher;
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      cipher = bf.encode(text);
      encTime += performance.now() - t0;
    }
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      bf.decode(cipher, Blowfish.TYPE.STRING);
      decTime += performance.now() - t0;
    }
    let heapAfter = getHeap();
    return { encTime, decTime, heapDelta: heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null };
  };

  const runTwofish = async (text, iters) => {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    const iv = new Uint8Array(16);
    crypto.getRandomValues(iv);
    const tf = twofish.twofish(Array.from(iv));
    const plain = tf.stringToByteArray(text);
    let encTime = 0;
    let decTime = 0;
    let heapBefore = getHeap();
    let cipher;
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      cipher = tf.encryptCBC(Array.from(key), plain);
      encTime += performance.now() - t0;
    }
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      const dec = tf.decryptCBC(Array.from(key), cipher);
      tf.byteArrayToString(dec);
      decTime += performance.now() - t0;
    }
    let heapAfter = getHeap();
    return { encTime, decTime, heapDelta: heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null };
  };

  const runAll = async () => {
    try {
      setError('');
      setRunning(true);
      const text = genText(payloadKB);
      const sizeMB = payloadKB / 1024;
      const resAES = await runAES(text, iterations);
      const resBF = await runBlowfish(text, iterations);
      const resTF = await runTwofish(text, iterations);
      const out = [
        { name: 'AES', encMs: resAES.encTime, decMs: resAES.decTime, mbps: (sizeMB * iterations) / ((resAES.encTime + resAES.decTime) / 1000), memMB: resAES.heapDelta !== null ? toMB(resAES.heapDelta) : null },
        { name: 'Blowfish', encMs: resBF.encTime, decMs: resBF.decTime, mbps: (sizeMB * iterations) / ((resBF.encTime + resBF.decTime) / 1000), memMB: resBF.heapDelta !== null ? toMB(resBF.heapDelta) : null },
        { name: 'Twofish', encMs: resTF.encTime, decMs: resTF.decTime, mbps: (sizeMB * iterations) / ((resTF.encTime + resTF.decTime) / 1000), memMB: resTF.heapDelta !== null ? toMB(resTF.heapDelta) : null }
      ];
      setResults(out);
    } catch (e) {
      setError(e.message || 'Falha no benchmark');
    } finally {
      setRunning(false);
    }
  };

  const colorMap = { AES: '#3b82f6', Blowfish: '#22c55e', Twofish: '#f59e0b' };
  const maxMb = results.length ? Math.max(1, ...results.map(r => (Number.isFinite(r.mbps) ? r.mbps : 0))) : 1;
  const maxTotalMs = results.length ? Math.max(1, ...results.map(r => (r.encMs + r.decMs))) : 1;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Benchmark de Criptografia</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <label>
          Tamanho do payload (KB)
          <input type="number" min={16} step={16} value={payloadKB} onChange={(e) => setPayloadKB(parseInt(e.target.value || '0', 10))} style={{ marginLeft: 8 }} />
        </label>
        <label>
          Iterações
          <input type="number" min={1} step={1} value={iterations} onChange={(e) => setIterations(parseInt(e.target.value || '1', 10))} style={{ marginLeft: 8 }} />
        </label>
        <button onClick={runAll} disabled={running} style={{ padding: '8px 16px' }}>{running ? 'Executando...' : 'Executar Benchmark'}</button>
      </div>
      {error && (
        <div style={{ color: '#ef4444', marginBottom: 16 }}>{error}</div>
      )}
      <div style={{ border: '1px solid #3f3f46', borderRadius: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: 12, background: '#18181b', color: '#e4e4e7' }}>
          <div>Algoritmo</div>
          <div>Enc (ms)</div>
          <div>Dec (ms)</div>
          <div>Throughput (MB/s)</div>
          <div>Δ Memória (MB)</div>
        </div>
        {results.map((r) => (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: 12, borderTop: '1px solid #27272a' }}>
            <div>{r.name}</div>
            <div>{r.encMs.toFixed(2)}</div>
            <div>{r.decMs.toFixed(2)}</div>
            <div>{Number.isFinite(r.mbps) ? r.mbps.toFixed(2) : '-'}</div>
            <div>{r.memMB !== null ? r.memMB.toFixed(3) : 'N/A'}</div>
          </div>
        ))}
      </div>
      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Visualização</h3>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Throughput (MB/s)</div>
            {results.map((r) => (
              <div key={`mbps-${r.name}`} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 120 }}>{r.name}</div>
                <div style={{ flex: 1, background: '#27272a', border: '1px solid #3f3f46', height: 16, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (Number.isFinite(r.mbps) ? (r.mbps / maxMb) * 100 : 0))}%`, background: colorMap[r.name], height: '100%' }} />
                </div>
                <div style={{ width: 72, textAlign: 'right' }}>{Number.isFinite(r.mbps) ? r.mbps.toFixed(2) : '-'}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Tempo total (ms)</div>
            {results.map((r) => {
              const total = r.encMs + r.decMs;
              return (
                <div key={`time-${r.name}`} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 120 }}>{r.name}</div>
                  <div style={{ flex: 1, background: '#27272a', border: '1px solid #3f3f46', height: 16, borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${Math.min(100, (total / maxTotalMs) * 100)}%`, background: colorMap[r.name], height: '100%' }} />
                  </div>
                  <div style={{ width: 72, textAlign: 'right' }}>{total.toFixed(2)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ marginTop: 12, color: '#a1a1aa' }}>Medição de memória depende do suporte do navegador.</div>
    </div>
  );
};

export default Benchmark;