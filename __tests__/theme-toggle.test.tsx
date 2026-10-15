import { fireEvent, render, screen } from "@testing-library/react";
import { useTheme } from "next-themes";
import ThemeToggle from "@/components/ui/theme-toggle";

jest.mock("next-themes", () => ({ useTheme: jest.fn() }));

it.each([['light', 'dark'], ['dark', 'light']])("switches %s to %s", (current, next) => {
    const setTheme = jest.fn();
    jest.mocked(useTheme).mockReturnValue({ resolvedTheme: current, setTheme, themes: ['light', 'dark'] });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle light or dark theme' }));
    expect(setTheme).toHaveBeenCalledWith(next);
});
