import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowRightLeft, Crop, Shrink } from 'lucide-react';

import type { ToolTab } from './ToolTabs';
import { ToolTabs } from './ToolTabs';

const tabs: ToolTab[] = [
  { id: 'convert', label: 'Convert', icon: ArrowRightLeft },
  { id: 'compress', label: 'Compress', icon: Shrink },
  { id: 'edit', label: 'Edit', icon: Crop },
];

describe('ToolTabs', () => {
  it('renders all tabs and marks the active one', () => {
    render(<ToolTabs activeTab="compress" onChange={vi.fn()} tabs={tabs} />);

    const compress = screen.getByRole('tab', { name: 'Compress' });
    expect(compress).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Convert' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls onChange with the tab id when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ToolTabs activeTab="convert" onChange={onChange} tabs={tabs} />);

    await user.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(onChange).toHaveBeenCalledWith('edit');
  });
});
