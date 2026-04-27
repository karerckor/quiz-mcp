export type OpenBrowser = (url: string) => Promise<void>;

export const defaultOpenBrowser: OpenBrowser = async (url) => {
  const { default: open } = await import("open");
  await open(url);
};
