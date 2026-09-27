// Demo: keine echten Push-Nachrichten – Hinweise erscheinen als Einblendung.

export const pushSupported = () => false;
export const isIos = () => false;
export const isStandalone = () => false;
export const registerServiceWorker = () => {};
export const currentSubscription = async () => null;
export const pushStatus = async () => 'demo';
export const enablePush = async () => {};
export const disablePush = async () => {};
export const syncSubscription = async () => {};
