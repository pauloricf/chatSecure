// 🔬 LABORATÓRIO DE SEGURANÇA
import React, { useEffect, useState } from 'react';
import forge from 'node-forge';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';
import { cryptoService } from '../services/cryptoService';
import { useNavigate } from 'react-router-dom';
import './SecurityLab.css';

const SecurityLab = () => {
  const navigate = useNavigate();
  const { user, certificate, getPrivateKey } = useAuth();

  const [users, setUsers] = useState([]);
  const [recipientId, setRecipientId] = useState('');
  const [recipientPublicKey, setRecipientPublicKey] = useState('');

  const [message, setMessage] = useState('Mensagem de teste segura');
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [markers, setMarkers] = useState({
    confidentiality: 'pending',
    integrity: 'pending',
    authenticity: 'pending',
  });

  const [error, setError] = useState('');
  const [userCertPem, setUserCertPem] = useState('');
  const [messageValidity, setMessageValidity] = useState(null);
  const [verificationNote, setVerificationNote] = useState('');

  useEffect(() => {
    // Carregar usuários para o painel e preparar certificado local
    const init = async () => {
      try {
        const usersResp = await apiService.getUsers();
        const list = usersResp?.data?.users || usersResp?.users || [];
        setUsers(list);
      } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err);
        const msg = typeof err === 'object' && err?.message ? err.message : 'Falha ao carregar usuários.';
        setError(`Falha ao carregar usuários: ${msg}`);
      }
    };
    init();
  }, []);

  // Preparar conteúdo do certificado atual do usuário
  useEffect(() => {
    try {
      const pem = certificate?.certificatePem || '';
      setUserCertPem(pem);
    } catch (e) {
      // silencioso
    }
  }, [certificate]);

  const extractPublicKeyFromCert = (certPem) => {
    try {
      const cert = forge.pki.certificateFromPem(certPem);
      return forge.pki.publicKeyToPem(cert.publicKey);
    } catch (_) {
      return '';
    }
  };

  const handleSelectRecipient = async (id) => {
    setRecipientId(id);
    setRecipientPublicKey('');
    if (!id) return;
    try {
      // Tentar pegar a chave pública diretamente do item de usuário carregado
      const u = users.find((x) => x.id === id);
      if (u?.publicKey) {
        setRecipientPublicKey(u.publicKey);
        return;
      }
      const resp = await apiService.getUserPublicKey(id);
      setRecipientPublicKey(resp?.publicKey || '');
    } catch (err) {
      console.error('Erro ao obter chave pública do destinatário:', err);
      setError('Não foi possível obter a chave pública do destinatário.');
    }
  };

  const runSimulation = async () => {
    setError('');
    setRunning(true);
    setResult(null);
    setMarkers({ confidentiality: 'pending', integrity: 'pending', authenticity: 'pending' });
    setMessageValidity(null);

    try {
      if (!recipientId || !recipientPublicKey) {
        throw new Error('Selecione um destinatário e carregue sua chave pública.');
      }

      const privateKey = getPrivateKey();
      if (!privateKey) {
        throw new Error('Chave privada do remetente não encontrada.');
      }

      // Etapa 1: AES cifra conteúdo (Confidencialidade)
      setCurrentStep(1);
      // Etapa 2: RSA-OAEP protege chave simétrica (Confidencialidade)
      setCurrentStep(2);
      // Etapa 3: Assinatura é gerada dentro do fluxo (Autenticidade)
      const encryptedData = await cryptoService.encryptMessage(message, recipientPublicKey, privateKey);
      setResult(encryptedData);
      setMarkers((m) => ({ ...m, confidentiality: 'ok' }));
      setCurrentStep(3);

      const senderPublicKeyFromCert = extractPublicKeyFromCert(userCertPem);
      const isSignatureValid = await cryptoService.verifySignature(
        message,
        encryptedData.signature,
        senderPublicKeyFromCert
      );
      setMarkers((m) => ({ ...m, authenticity: isSignatureValid ? 'ok' : 'fail' }));
      setVerificationNote(
        isSignatureValid
          ? `Assinatura validada usando chave pública extraída do certificado X.509 do remetente${certificate?.subject ? ` (${certificate.subject})` : ''}.`
          : 'Falha na verificação de assinatura com a chave pública do certificado do remetente.'
      );
      setCurrentStep(4);

      // Etapa 5: Hash (integridade)
      const localHash = cryptoService.hashMessage(message);
      const integrityOk = localHash === encryptedData.messageHash;
      setMarkers((m) => ({ ...m, integrity: integrityOk ? 'ok' : 'fail' }));
      setCurrentStep(5);

      // Resumo de validade da mensagem
      const validity = (isSignatureValid && integrityOk) ? 'valid' : 'invalid';
      setMessageValidity(validity);

    } catch (err) {
      console.error('Erro na simulação:', err);
      setError(err.message || 'Erro na simulação');
      setMarkers((m) => ({ ...m, confidentiality: 'fail' }));
    } finally {
      setRunning(false);
    }
  };

  const StepTimeline = ({ step }) => {
    const steps = [
      { id: 1, title: 'AES-256-CBC cifra o conteúdo', principles: ['Confidencialidade'] },
      { id: 2, title: 'RSA-OAEP protege a chave simétrica', principles: ['Confidencialidade'] },
      { id: 3, title: 'SHA256withRSA assina a mensagem', principles: ['Autenticidade'] },
      { id: 4, title: 'SHA-256 computa o hash', principles: ['Integridade'] },
      { id: 5, title: 'Verifica assinatura e hash', principles: ['Autenticidade', 'Integridade'] },
    ];
    return (
      <div className="timeline">
        {steps.map((s) => {
          const state = step === s.id ? 'active' : step > s.id ? 'done' : 'pending';
          return (
            <div key={s.id} className={`timeline-step ${state}`}>
              <div className="left">
                <div className="badge">{s.id}</div>
                <div className="title">{s.title}</div>
              </div>
              <div className="principles">
                {s.principles.map((p) => (
                  <span key={p} className={`chip ${p.toLowerCase()}`}>{p}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const KeyGenInfo = () => (
    <div className="keygen-info">
      <h3>🔑 Como sua chave é gerada</h3>
      <ul>
        <li>Par RSA 2048 bits é gerado no cliente.</li>
        <li>Certificado X.509 autoassinado com SHA-256 é criado.</li>
        <li>Chave privada é criptografada com PBKDF2 + AES-CBC usando sua senha.</li>
        <li>Nenhuma chave privada vai para o servidor; apenas o certificado público.</li>
      </ul>
    </div>
  );

  const ValidityBadge = () => {
    if (!messageValidity) return null;
    const isValid = messageValidity === 'valid';
    return (
      <div className={`validity-badge ${isValid ? 'valid' : 'invalid'}`}>
        {isValid ? '✅ Mensagem válida (assinatura e hash conferem)' : '❌ Mensagem inválida (falha em assinatura ou hash)'}
      </div>
    );
  };

  const Marker = ({ label, status, description }) => {
    const icon = status === 'ok' ? '✅' : status === 'fail' ? '❌' : '⏳';
    const cls = `marker ${status}`;
    return (
      <div className={cls}>
        <div className="marker-top">
          <span className="marker-icon">{icon}</span>
          <span className="marker-label">{label}</span>
        </div>
        <div className="marker-desc">{description}</div>
      </div>
    );
  };

  const DidacticNotes = () => (
    <div className="didactic-notes">
      <div className="note">Assinatura gerada sobre o texto original antes da criptografia.</div>
      {verificationNote && (
        <div className="note">{verificationNote}</div>
      )}
    </div>
  );

  return (
    <div className="securitylab-container">
      <header className="securitylab-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">🔬</span>
            <h1>Laboratório de Segurança</h1>
          </div>
        </div>
        <div className="header-center">
          <div className="user-info">
            <span className="user-icon">👤</span>
            <span className="username">{user?.username}</span>
            <span className="user-status">🟢 Online</span>
          </div>
        </div>
        <div className="header-right">
          <button className="back-button" onClick={() => navigate('/dashboard')}>
            <span>↩️</span>
            Voltar
          </button>
        </div>
      </header>

      <div className="securitylab-content">
        <section className="panel">
          <h2>Simular Processo de Criptografia</h2>
          <p>Veja em qual etapa cada princípio é contemplado: confidencialidade, integridade e autenticidade.</p>

          <KeyGenInfo />

          <div className="form-row">
            <label>Mensagem</label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem de teste"
            />
          </div>

          <div className="form-row">
            <label>Destinatário</label>
            <select value={recipientId} onChange={(e) => handleSelectRecipient(e.target.value)}>
              <option value="">Selecione um usuário</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {recipientPublicKey && (
            <div className="form-row">
              <label>Chave pública do destinatário (PEM)</label>
              <textarea value={recipientPublicKey} readOnly rows={6} />
            </div>
          )}

          <div className="actions">
            <button className="run-button" onClick={runSimulation} disabled={running || !recipientId}>
              {running ? 'Processando...' : 'Executar Simulação'}
            </button>
          </div>

          {error && <div className="status error">❌ {error}</div>}

          {/* Marcadores dos princípios de segurança */}
          <div className="results">
            <StepTimeline step={currentStep} />
            <ValidityBadge />
            <DidacticNotes />
            <div className="markers">
                <Marker
                  label="Confidencialidade"
                  status={markers.confidentiality}
                  description="AES-256-CBC no conteúdo + RSA-OAEP na chave simétrica"
                />
                <Marker
                  label="Integridade"
                  status={markers.integrity}
                  description="SHA-256 do conteúdo compara com o hash gerado"
                />
                <Marker
                  label="Autenticidade"
                  status={markers.authenticity}
                  description="Assinatura SHA256withRSA verificada com a chave pública"
                />
            </div>
            {result && (
              <div className="result-grid">
                <div className="result-item">
                  <h3>🔒 Mensagem cifrada (AES)</h3>
                  <pre>{String(result.encryptedMessage).substring(0, 500)}</pre>
                </div>
                <div className="result-item">
                  <h3>🔑 Chave simétrica protegida (RSA-OAEP)</h3>
                  <pre>{String(result.encryptedKey).substring(0, 500)}</pre>
                </div>
                <div className="result-item">
                  <h3>✍️ Assinatura (SHA256withRSA)</h3>
                  <pre>{String(result.signature).substring(0, 500)}</pre>
                </div>
                <div className="result-item">
                  <h3>🧮 Hash (SHA-256)</h3>
                  <pre>{String(result.messageHash)}</pre>
                </div>
                <div className="result-item">
                  <h3>📦 Pacote final enviado</h3>
                  <pre>{JSON.stringify({
                    encryptedMessage: result.encryptedMessage,
                    encryptedKey: result.encryptedKey,
                    senderEncryptedKey: result.senderEncryptedKey,
                    iv: result.iv,
                    signature: result.signature,
                    messageHash: result.messageHash
                  }, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Certificado enviado (Atual)</h2>
          <p>Este é o certificado X.509 que foi enviado ao servidor no registro/login.</p>
          {userCertPem ? (
            <div className="cert-block">
              <h3>📜 Conteúdo (PEM)</h3>
              <pre>{userCertPem}</pre>
              <div className="cert-meta">
                <div><strong>Serial:</strong> {certificate?.serialNumber || '—'}</div>
                <div><strong>Subject:</strong> {certificate?.subject || '—'}</div>
                <div><strong>Issuer:</strong> {certificate?.issuer || '—'}</div>
                <div><strong>Válido de:</strong> {certificate?.validFrom ? String(certificate.validFrom) : '—'}</div>
                <div><strong>Válido até:</strong> {certificate?.validTo ? String(certificate.validTo) : '—'}</div>
              </div>
            </div>
          ) : (
            <div className="cert-empty">Certificado não encontrado no contexto. Faça login novamente.</div>
          )}
        </section>
      </div>
    </div>
  );
};

export default SecurityLab;