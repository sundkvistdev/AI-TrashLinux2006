import { ISocAssembly, IGsocCache } from "../types/soc";
import assembliesData from "../data/assemblies.json";

export const getAssemblies = (): Record<string, ISocAssembly> => {
  return assembliesData as unknown as Record<string, ISocAssembly>;
};

// Global SOC Cache initializer helper
export const initGsocCache = (syscall?: any): IGsocCache => {
  if (typeof window !== "undefined") {
    if (!(window as any).GSOCC) {
      (window as any).GSOCC = {
        assemblies: getAssemblies()
      };
    }

    const gsocc = (window as any).GSOCC;
    if (syscall && gsocc && gsocc.assemblies) {
      const loadFromFolder = (path: string) => {
        try {
          const files = syscall.listDir(path);
          if (files) {
            files.forEach((file: any) => {
              if (file.type === "FILE" && file.name.endsWith(".soc")) {
                try {
                  const fullPath = path.endsWith("/") ? `${path}${file.name}` : `${path}/${file.name}`;
                  const content = syscall.readFile(fullPath);
                  const parsed = JSON.parse(content);
                  if (parsed && parsed.name) {
                    gsocc.assemblies[parsed.name] = parsed;
                  }
                } catch (e) {
                  console.error(`GSOCC failed to parse custom assembly ${file.name}`, e);
                }
              }
            });
          }
        } catch (e) {
          // Path might not exist, ignore silently
        }
      };

      loadFromFolder("/sys/lib");
      loadFromFolder("/home/tux/Documents/Assemblies");
    }

    return gsocc;
  }
  return { assemblies: getAssemblies() };
};
