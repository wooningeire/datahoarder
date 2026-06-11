import { expect, type Page } from "@playwright/test";

export const expectSelectedFilePath = async (page: Page, path: string): Promise<void> => {
    await expect(page.locator(".topbar").getByRole("heading", { name: path })).toBeVisible();
};

