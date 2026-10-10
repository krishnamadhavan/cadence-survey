import { toString } from "qrcode";

export async function totpQrSvg(otpauthUrl: string): Promise<string> {
  const svg = await toString(otpauthUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
  if (
    !svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ') ||
    svg.includes("<script")
  ) {
    throw new Error("Could not build the setup code.");
  }
  return svg;
}
