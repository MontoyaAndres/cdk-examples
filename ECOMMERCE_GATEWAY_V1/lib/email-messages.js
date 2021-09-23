function INVITATION_EMAIL_MESSAGE(values) {
  return {
    Body: {
      Html: {
        Charset: 'UTF-8',
        Data: `
<p>${values.UserName} te ha invitado a ser parte de su equipo.</p>
URL: https://prueba.com/${values.InvitationId}
        `,
      },
    },
    Subject: {
      Charset: 'UTF-8',
      Data: `${values.AccountName} te ha invitado a unirte como ${values.RolName}.`,
    },
  };
}

const EmailMessages = {
  INVITATION_EMAIL_MESSAGE,
};

module.exports = { EmailMessages };
