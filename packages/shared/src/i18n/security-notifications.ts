import type { Locale } from '../index';
export const newDeviceCopy: Record<
  Locale,
  { subject: string; body: string; action: string }
> = {
  en: {
    subject: 'New sign-in to your Stella account',
    body: 'Your Stella staff account was signed in on a device we do not recognize. If this was you, no action is needed.',
    action:
      'If this was not you, contact the account owner, reset your password and sign out of all sessions.',
  },
  it: {
    subject: 'Nuovo accesso al tuo account Stella',
    body: 'È stato effettuato un accesso al tuo account dello staff Stella da un dispositivo non riconosciuto. Se sei stato tu, non è necessario fare nulla.',
    action:
      'Se non sei stato tu, contatta il titolare dell’account, reimposta la password e disconnetti tutte le sessioni.',
  },
  es: {
    subject: 'Nuevo inicio de sesión en tu cuenta de Stella',
    body: 'Se ha iniciado sesión en tu cuenta del personal de Stella desde un dispositivo que no reconocemos. Si has sido tú, no tienes que hacer nada.',
    action:
      'Si no has sido tú, contacta con el propietario de la cuenta, restablece tu contraseña y cierra todas las sesiones.',
  },
  fr: {
    subject: 'Nouvelle connexion à votre compte Stella',
    body: 'Votre compte professionnel Stella a été utilisé depuis un appareil non reconnu. Si vous êtes à l’origine de cette connexion, aucune action n’est nécessaire.',
    action:
      'Sinon, contactez le propriétaire du compte, réinitialisez votre mot de passe et déconnectez toutes vos sessions.',
  },
  de: {
    subject: 'Neue Anmeldung bei Ihrem Stella-Konto',
    body: 'Bei Ihrem Stella-Mitarbeiterkonto wurde eine Anmeldung von einem unbekannten Gerät festgestellt. Wenn Sie das waren, müssen Sie nichts unternehmen.',
    action:
      'Andernfalls kontaktieren Sie den Kontoinhaber, setzen Sie Ihr Passwort zurück und melden Sie alle Sitzungen ab.',
  },
  ru: {
    subject: 'Новый вход в ваш аккаунт Stella',
    body: 'В ваш рабочий аккаунт Stella выполнен вход с незнакомого устройства. Если это были вы, ничего делать не нужно.',
    action:
      'Если это были не вы, свяжитесь с владельцем аккаунта, сбросьте пароль и завершите все сеансы.',
  },
  tr: {
    subject: 'Stella hesabınıza yeni giriş',
    body: 'Stella personel hesabınıza tanımadığımız bir cihazdan giriş yapıldı. Girişi siz yaptıysanız herhangi bir işlem yapmanız gerekmez.',
    action:
      'Girişi siz yapmadıysanız hesap sahibiyle iletişime geçin, şifrenizi sıfırlayın ve tüm oturumlardan çıkış yapın.',
  },
};
