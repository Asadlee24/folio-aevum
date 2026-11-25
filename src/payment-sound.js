let context;
let voice;

// Prepare audio during the Pay click, while the browser allows audio to start.
export function preparePaymentSound() {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return;

  try {
    context ??= new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});
    voice ??= fetch('/assets/payment-confirmed.mp3')
      .then((response) => {
        if (!response.ok) throw new Error('Confirmation audio unavailable');
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .catch(() => {
        voice = undefined;
        return null;
      });
  } catch {
    // Audio is optional and must never interrupt checkout.
    return;
  }

  return async (stillOnReceipt) => {
    const buffer = await voice;
    if (!buffer || context.state !== 'running' || !stillOnReceipt()) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = .72;
    source.connect(gain).connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(context.currentTime + .08);
  };
}
