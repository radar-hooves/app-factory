import Root from './sheet.svelte';
import Trigger from './sheet-trigger.svelte';
import Close from './sheet-close.svelte';
import Portal from './sheet-portal.svelte';
import Overlay from './sheet-overlay.svelte';
import Content from './sheet-content.svelte';
import Header from './sheet-header.svelte';
import Body from './sheet-body.svelte';
import Footer from './sheet-footer.svelte';
import Title from './sheet-title.svelte';
import Description from './sheet-description.svelte';

export { sheetVariants, type SheetSide } from './sheet-content.svelte';

export {
	Root,
	Trigger,
	Close,
	Portal,
	Overlay,
	Content,
	Header,
	Body,
	Footer,
	Title,
	Description,
	//
	Root as Sheet,
	Trigger as SheetTrigger,
	Close as SheetClose,
	Portal as SheetPortal,
	Overlay as SheetOverlay,
	Content as SheetContent,
	Header as SheetHeader,
	Body as SheetBody,
	Footer as SheetFooter,
	Title as SheetTitle,
	Description as SheetDescription
};
