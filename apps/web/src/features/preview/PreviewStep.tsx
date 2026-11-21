import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/misc.tsx';
import { useMediaQuery } from '../../lib/use-media-query.ts';

/**
 * Step 3. Wide screens: the editor and the PDF side by side. Narrow screens: two tabs, so the
 * PDF gets the full width. Only one layout is mounted at a time, so the form exists once.
 */
export function PreviewStep({ editor, pdf }: { editor: ReactNode; pdf: ReactNode }) {
  const wide = useMediaQuery('(min-width: 1024px)');

  if (wide) {
    return (
      <div className="grid grid-cols-2 items-start gap-6">
        <div>{editor}</div>
        <div className="sticky top-4">{pdf}</div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="preview" className="flex flex-col gap-4">
      <TabsList aria-label="Edit or preview">
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent value="edit">{editor}</TabsContent>
      <TabsContent value="preview">{pdf}</TabsContent>
    </Tabs>
  );
}
