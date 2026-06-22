-- ============================================================
-- SEED: Sample Books for Testing
-- Replace 'YOUR_ORG_ID' with your actual organization UUID
-- ============================================================

-- To find your org_id, run:
-- SELECT id, display_name FROM organizations LIMIT 5;

-- Then replace below:
-- Example: SET my.org_id = '09dd0d4e-b45a-4a71-a617-4373c34260f6';

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get the first organization (adjust if needed)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Create one first.';
  END IF;

  -- Fiction
  INSERT INTO public.books (org_id, title, author, isbn, category, description, price, stock) VALUES
  (v_org_id, 'Dune', 'Frank Herbert', '978-0441013593', 'Science Fiction',
   'Set on the desert planet Arrakis, Dune is the story of Paul Atreides and his family''s struggle for control of the most valuable substance in the universe.', 12.99, 25),

  (v_org_id, '1984', 'George Orwell', '978-0451524935', 'Fiction',
   'A dystopian novel set in a totalitarian society ruled by Big Brother, exploring themes of surveillance, truth, and freedom.', 9.99, 40),

  (v_org_id, 'To Kill a Mockingbird', 'Harper Lee', '978-0061120084', 'Fiction',
   'A classic novel about racial injustice in the American South, seen through the eyes of young Scout Finch.', 11.49, 30),

  (v_org_id, 'The Great Gatsby', 'F. Scott Fitzgerald', '978-0743273565', 'Fiction',
   'A tale of wealth, love, and the American Dream set in the Jazz Age of the 1920s.', 8.99, 35),

  -- Science & Technology
  (v_org_id, 'A Brief History of Time', 'Stephen Hawking', '978-0553380163', 'Science',
   'An accessible exploration of the universe, from the Big Bang to black holes, by one of the greatest physicists.', 14.99, 20),

  (v_org_id, 'Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '978-0062316097', 'Science',
   'A sweeping narrative of human history, from the evolution of Homo sapiens to the present day.', 16.99, 15),

  -- Programming
  (v_org_id, 'Clean Code', 'Robert C. Martin', '978-0132350884', 'Programming',
   'A handbook of agile software craftsmanship with practical advice on writing readable, maintainable code.', 29.99, 20),

  (v_org_id, 'JavaScript: The Good Parts', 'Douglas Crockford', '978-0596517748', 'Programming',
   'A concise guide to the best features of JavaScript, helping developers write elegant and effective code.', 19.99, 18),

  (v_org_id, 'The Pragmatic Programmer', 'David Thomas & Andrew Hunt', '978-0135957059', 'Programming',
   'A timeless guide to software development covering topics from career development to architectural techniques.', 34.99, 12),

  -- Self-Help & Business
  (v_org_id, 'Atomic Habits', 'James Clear', '978-0735211292', 'Self-Help',
   'A practical guide to building good habits and breaking bad ones, using proven strategies from biology and psychology.', 13.99, 50),

  (v_org_id, 'Rich Dad Poor Dad', 'Robert Kiyosaki', '978-1612680194', 'Business',
   'Personal finance lessons about money, investing, and building wealth, told through the contrast of two father figures.', 10.99, 45),

  -- Children & Education
  (v_org_id, 'Harry Potter and the Philosopher''s Stone', 'J.K. Rowling', '978-0747532699', 'Fantasy',
   'The first book in the Harry Potter series, following a young wizard''s journey at Hogwarts School of Witchcraft and Wizardry.', 12.49, 60),

  (v_org_id, 'The Alchemist', 'Paulo Coelho', '978-0062315007', 'Fiction',
   'A philosophical novel about a shepherd boy''s journey to find treasure and discover his personal legend.', 11.99, 35),

  -- Out of stock example
  (v_org_id, 'Design Patterns', 'Gang of Four', '978-0201633610', 'Programming',
   'The classic reference for object-oriented design patterns, describing 23 foundational patterns for software development.', 39.99, 0);

  RAISE NOTICE 'Inserted 14 sample books for org %', v_org_id;
END $$;
