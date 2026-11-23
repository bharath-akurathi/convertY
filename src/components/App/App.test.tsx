import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '.';

describe('App component', () => {
  it('renders the convertY header, the tabs, and the footer', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /file workbench/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/files never leave your device/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /choose file/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tabpanel', { name: 'Convert' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/remarkablemark\/file-converter/i),
    ).toBeInTheDocument();
  });

  it('moves through tools by keyboard and keeps the panel labelled', async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('tab', { name: 'Convert' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Archives' })).toHaveFocus();
    await user.keyboard('{ArrowRight}{End}{Home}{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Compress' })).toHaveFocus();
    expect(
      screen.getByRole('tabpanel', { name: 'Compress' }),
    ).toBeInTheDocument();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  it('switches tools when a tab is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole('button', { name: /choose file/i }),
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
      screen.getByRole('button', { name: /choose file/i }),
    ).toBeInTheDocument();
  });
});
