/**
 * Rota legada — agora a configuração da IA vive dentro de "Config" → "Config IA".
 * Redirecionamos para a home pra evitar links quebrados.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ConfigurarIaPage = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);
  return null;
};

export default ConfigurarIaPage;
