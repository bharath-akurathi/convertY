import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '.';

describe('App component', () => {
  it('renders the convertY header, the tabs, and the footer', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /convertY/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/files never leave your device/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /upload file/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/archives: zip only/i)).toBeInTheDocument();
    expect(
      screen.getByText(/remarkablemark\/file-converter/i),
    ).toBeInTheDocument();
  });

  it('switches tools when a tab is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole('button', { name: /upload file/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Compress' }));
    expect(
      screen.getByRole('heading', { name: /image compressor/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /batch mode/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(
      screen.getByRole('heading', { name: /image editor/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(
      screen.getByRole('heading', { name: /document tools/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Archives' }));
    expect(
      screen.getByRole('heading', { name: /^archives$/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Convert' }));
    expect(
      screen.getByRole('button', { name: /upload file/i }),
    ).toBeInTheDocument();
  });
});
