import { AmplifyAuthenticator, AmplifySignOut } from '@aws-amplify/ui-react';

export const Root = () => {
  return (
    <AmplifyAuthenticator>
      <div>
        Root
        <AmplifySignOut />
      </div>
    </AmplifyAuthenticator>
  );
};
