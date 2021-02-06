import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export const Home = () => {
  const { status, user } = useAuth();
  const history = useHistory();

  useEffect(() => {
    const isAuthenticated = Boolean(Object.keys(user).length);

    if (!isAuthenticated && status === 'resolved') {
      history.push('/');
    }
  }, [status, user]);

  return <h1>home</h1>;
};
