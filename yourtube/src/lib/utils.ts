import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function encodeFilePath(filepath: string) {
  return filepath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}
