import { useEffect, useState } from 'react';
import { Auth } from 'aws-amplify';

export const useAuth = () => {
  const [user, setUser] = useState({});
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const handleCurrentUser = async () => {
      setStatus('pending');

      try {
        const currentUser = await Auth.currentAuthenticatedUser();

        if (currentUser) {
          setUser(currentUser);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setStatus('resolved');
      }
    };

    handleCurrentUser();
  }, []);

  return { status, user };
};
